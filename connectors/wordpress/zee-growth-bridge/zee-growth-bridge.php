<?php
/**
 * Plugin Name: ZEE Growth Private Reporting Bridge
 * Description: Read-only WooCommerce aggregates and signed reporting imports for the ZEE GitHub dashboard. Stage and reconcile before production use.
 * Version: 0.3.0
 * Requires PHP: 8.1
 * Author: ZEE
 */
if (!defined('ABSPATH')) { exit; }

final class Zee_Growth_Bridge {
    const CAP = 'view_zee_growth';
    const ORIGIN = 'https://omarradwann.github.io';
    const DAYS = 56;
    const BATCH_SIZE = 100;

    public static function boot() {
        add_action('admin_menu', [__CLASS__, 'menu']);
        add_action('wp_ajax_zee_growth_snapshot', [__CLASS__, 'ajax_snapshot']);
        add_action('wp_ajax_zee_growth_advance', [__CLASS__, 'ajax_advance']);
        add_action('rest_api_init', [__CLASS__, 'routes']);
        add_action('zee_growth_refresh_woo', [__CLASS__, 'refresh_woo']);
        add_action('zee_growth_daily_cleanup', [__CLASS__, 'cleanup']);
        add_action('woocommerce_new_order', [__CLASS__, 'schedule_refresh']);
        add_action('woocommerce_order_status_changed', [__CLASS__, 'schedule_refresh']);
        add_action('woocommerce_order_refunded', [__CLASS__, 'schedule_refresh']);
        add_action('woocommerce_update_order', [__CLASS__, 'schedule_refresh']);
        add_action('woocommerce_before_delete_order', [__CLASS__, 'schedule_refresh']);
        add_action('woocommerce_before_trash_order', [__CLASS__, 'schedule_refresh']);
    }
    public static function activate() {
        $role = get_role('administrator');
        if ($role) { $role->add_cap(self::CAP); }
        foreach (['ads', 'events', 'seo'] as $source) {
            if (!get_option('zee_growth_key_' . $source)) {
                add_option('zee_growth_key_' . $source, bin2hex(random_bytes(32)), '', false);
            }
        }
        if (!wp_next_scheduled('zee_growth_daily_cleanup')) { wp_schedule_event(time() + 86400, 'daily', 'zee_growth_daily_cleanup'); }
        self::schedule_refresh();
    }
    public static function deactivate() {
        wp_clear_scheduled_hook('zee_growth_refresh_woo');
        wp_clear_scheduled_hook('zee_growth_daily_cleanup');
        $role = get_role('administrator');
        if ($role) { $role->remove_cap(self::CAP); }
        // Reporting options remain for recovery. Nothing in the store is modified or deleted.
    }
    public static function menu() {
        add_menu_page('ZEE Growth connection', 'ZEE Growth', self::CAP, 'zee-growth-bridge', [__CLASS__, 'page'], 'dashicons-chart-line', 58);
    }
    public static function page() {
        if (!current_user_can(self::CAP)) { wp_die('Reporting permission required.', '', ['response' => 403]); }
        nocache_headers();
        header('Referrer-Policy: no-referrer');
        header('X-Robots-Tag: noindex, nofollow');
        if (isset($_POST['zee_growth_refresh'])) {
            check_admin_referer('zee-growth-admin');
            if (current_user_can('manage_options')) { self::schedule_refresh(); }
        }
        ?>
        <div class="wrap" style="max-width:800px">
        <h1>ZEE Growth · private reporting connection</h1>
        <p>This window connects aggregate reporting to <strong>omarradwann.github.io/zee-growth-dashboard/</strong>. No customer names, addresses, phone numbers, order IDs or account passwords are shared.</p>
        <p><strong>Environment:</strong> <?php echo esc_html(self::environment()); ?>. Staging numbers are not production sales.</p>
        <button type="button" class="button button-primary" id="zee-authorize">Allow this dashboard tab to view reports</button>
        <button type="button" class="button" id="zee-stop">Stop sharing</button>
        <p id="zee-status">Open this window using “Connect data” on the dashboard. Then approve sharing above.</p>
        <p>Keep this connection window open. Your WordPress permissions are checked on every refresh. Close it or sign out to stop new data being shared.</p>
        <p>WooCommerce snapshots are refreshed in the background, at most every five minutes while requested. Google Ads has its own processing delays. This is not a banking or delivery reconciliation.</p>
        <?php if (current_user_can('manage_options')) : ?>
        <hr><h2>Source setup — administrators only</h2>
        <p>Give the reporting-only role <code>view_zee_growth</code> to approved team members. They do not need permission to edit orders, products, campaigns or settings.</p>
        <p>Copy the matching key into the approved source’s server-side connector. Do not put these keys in GitHub, HTML, a browser tracker or chat.</p>
        <?php foreach (['ads', 'events', 'seo'] as $source) : ?>
          <details style="margin:15px 0"><summary><?php echo esc_html(strtoupper($source)); ?> source setup</summary>
          <p>Signed POST URL: <code><?php echo esc_html(rest_url('zee-growth/v1/ingest/' . $source)); ?></code></p>
          <label>Private ingestion key <input type="password" readonly autocomplete="off" style="width:100%" value="<?php echo esc_attr(get_option('zee_growth_key_' . $source)); ?>" onclick="this.select()"></label>
          </details>
        <?php endforeach; ?>
        <form method="post"><?php wp_nonce_field('zee-growth-admin'); ?><button name="zee_growth_refresh" class="button" value="1">Request store refresh</button></form>
        <p><?php echo esc_html(get_option('zee_growth_woo_error', '')); ?></p>
        <p>Background collection reads at most <?php echo esc_html(self::BATCH_SIZE); ?> orders per job. Only reconciled whole days appear. Order changes queue the affected day; recent days refresh first. A server cron is required for unattended updates.</p>
        <?php endif; ?>
        </div>
        <script>
        (() => {
          const target = <?php echo wp_json_encode(self::ORIGIN); ?>;
          const session = decodeURIComponent(location.hash.slice(1));
          const nonce = <?php echo wp_json_encode(wp_create_nonce('zee-growth-read')); ?>;
          const endpoint = <?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>;
          const status = document.getElementById('zee-status');
          let allowed = false, busy = false, advancing = false, advanceTimer;
          function send(message) { if (window.opener && session) window.opener.postMessage({...message, session}, target); }
          async function snapshot() {
            if (!allowed || busy) return;
            busy = true;
            try {
              const response = await fetch(endpoint, {method:'POST', credentials:'same-origin', cache:'no-store', body:new URLSearchParams({action:'zee_growth_snapshot', _ajax_nonce:nonce})});
              if (!response.ok) throw new Error('Your session expired, permission changed, or the store could not refresh. Reconnect from the dashboard.');
              const result = await response.json();
              if (!result.success) throw new Error(result.data?.message || 'Reporting is not ready.');
              send({type:'zee-growth-data', payload:result.data, progress:result.data.progress});
              const p = result.data.progress;
              status.textContent = 'Sharing private reports. Store history: ' + p.completeDays + ' of ' + p.targetDays + ' days. ' + (p.error || '') + ' Last request: ' + new Date().toLocaleTimeString();
            } catch(error) { status.textContent = error.message; send({type:'zee-growth-error', message:error.message}); }
            finally { busy = false; }
          }
          async function advance() {
            if (!allowed || advancing) return;
            advancing = true;
            let next = 60000;
            try {
              const response = await fetch(endpoint, {method:'POST', credentials:'same-origin', cache:'no-store', body:new URLSearchParams({action:'zee_growth_advance', _ajax_nonce:nonce})});
              if (!response.ok) throw new Error('Background refresh needs a valid WordPress session.');
              const result = await response.json();
              if (!result.success) throw new Error('Background refresh was not accepted.');
              if (result.data.completeDays < result.data.targetDays) next = 8000;
              await snapshot();
            } catch(error) { status.textContent = error.message; }
            finally { advancing = false; if (allowed) advanceTimer = setTimeout(advance, next); }
          }
          document.getElementById('zee-authorize').onclick = () => {
            if (!window.opener || !/^[a-f0-9-]{36}$/i.test(session)) { status.textContent = 'Reopen this window using Connect data on the dashboard.'; return; }
            allowed = true; clearTimeout(advanceTimer); send({type:'zee-growth-ready'}); snapshot(); advance();
          };
          document.getElementById('zee-stop').onclick = () => { allowed = false; clearTimeout(advanceTimer); status.textContent = 'Sharing stopped. Close this window to finish.'; send({type:'zee-growth-error', message:'Sharing was stopped in WordPress.'}); };
          window.addEventListener('message', e => { if (e.origin === target && e.source === window.opener && e.data?.session === session && e.data.type === 'zee-growth-request') snapshot(); });
        })();
        </script>
        <?php
    }
    public static function environment() {
        return strtolower((string) wp_parse_url(home_url(), PHP_URL_HOST)) === 'zee-official.com' ? 'production' : 'staging';
    }
    public static function schedule_refresh($order_id = 0) {
        if (is_numeric($order_id) && $order_id > 0 && function_exists('wc_get_order')) {
            $order = wc_get_order($order_id);
            if ($order && $order->get_date_created()) {
                $date = wp_date('Y-m-d', $order->get_date_created()->getTimestamp(), new DateTimeZone('Africa/Cairo'));
                // Keep a version rather than deleting queue entries: a concurrent update cannot be lost.
                update_option('zee_growth_dirty_' . $date, sprintf('%.6f', microtime(true)), false);
            }
        }
        if (!wp_next_scheduled('zee_growth_refresh_woo')) { wp_schedule_single_event(time() + 10, 'zee_growth_refresh_woo'); }
    }
    private static function dates() {
        $today = new DateTimeImmutable('today', new DateTimeZone('Africa/Cairo'));
        $dates = [];
        for ($i = 0; $i <= self::DAYS; $i++) { $dates[] = $today->modify('-' . $i . ' days')->format('Y-m-d'); }
        return $dates;
    }
    private static function empty_day($date) {
        return ['date'=>$date, 'orders'=>0, 'paidOrders'=>0, 'recordedPaidValue'=>0.0, 'cancelledOrders'=>0, 'completedOrders'=>0, 'refundValue'=>0.0];
    }
    public static function progress() {
        $done = 0; $oldest = time();
        foreach (self::dates() as $date) {
            $day = get_option('zee_growth_day_' . $date);
            if (is_array($day)) { $done++; $oldest = min($oldest, $day['synced']); }
        }
        $job = get_option('zee_growth_woo_job');
        return ['completeDays'=>$done, 'targetDays'=>self::DAYS + 1, 'workingDate'=>is_array($job) ? $job['date'] : null, 'workingPage'=>is_array($job) ? $job['page'] : null, 'oldestDayCheck'=>$done ? gmdate('c', $oldest) : null, 'error'=>sanitize_text_field(get_option('zee_growth_woo_error', '')), 'nextCron'=>wp_next_scheduled('zee_growth_refresh_woo'), 'wpCronDisabled'=>defined('DISABLE_WP_CRON') && DISABLE_WP_CRON];
    }
    public static function ajax_advance() {
        if (!current_user_can(self::CAP)) { wp_send_json_error(['message'=>'Reporting permission required.'], 403); }
        check_ajax_referer('zee-growth-read');
        nocache_headers();
        header('Cache-Control: private, no-store, max-age=0');
        // Only approved reporting sessions can advance a bounded job. Never run an unbounded scan.
        self::refresh_woo();
        wp_send_json_success(self::progress());
    }
    private static function publish_woo() {
        $rows = []; $latest_sync = 0;
        foreach (self::dates() as $date) {
            $day = get_option('zee_growth_day_' . $date);
            if (!is_array($day)) { break; }
            $rows[] = $day['row'];
            $latest_sync = max($latest_sync, $day['synced']);
        }
        if (!$rows) { return; }
        $rows = array_reverse($rows);
        update_option('zee_growth_woo_snapshot', ['source'=>['status'=>'connected', 'lastSync'=>gmdate('c', $latest_sync), 'from'=>$rows[0]['date'], 'to'=>$rows[count($rows)-1]['date'], 'note'=>'Created-date cohorts maintained by order-change hooks and six-hour day reconciliation when cron runs. Last sync is the latest successful day update; oldest day check is shown separately. Paid value is gross before refunds, not settled cash.'], 'rows'=>$rows], false);
    }
    public static function refresh_woo() {
        if (!function_exists('wc_get_orders')) { update_option('zee_growth_woo_error', 'WooCommerce is not active.', false); return; }
        if (get_woocommerce_currency() !== 'EGP' || wp_timezone_string() !== 'Africa/Cairo') { update_option('zee_growth_woo_error', 'EGP and the Africa/Cairo WordPress timezone are required. Do not change store settings automatically.', false); return; }
        // Atomic lock prevents concurrent workers from adding/overwriting partial aggregates.
        if (!add_option('zee_growth_woo_lock', time(), '', false)) {
            if ((int) get_option('zee_growth_woo_lock') < time() - 900) { delete_option('zee_growth_woo_lock'); }
            self::schedule_refresh();
            return;
        }
        try {
            if ((int) get_option('zee_growth_last_attempt', 0) > time() - 3) { self::schedule_refresh(); return; }
            update_option('zee_growth_last_attempt', time(), false);
            $dates = self::dates();
            $state = get_option('zee_growth_woo_job');
            if (!is_array($state) || !in_array($state['date'], $dates, true)) {
                $state = null;
                foreach ($dates as $date) {
                    $day = get_option('zee_growth_day_' . $date);
                    $dirty = (string) get_option('zee_growth_dirty_' . $date, '0');
                    $ttl = $date === $dates[0] ? 300 : 21600;
                    if (!$day || $day['stamp'] !== $dirty || $day['synced'] < time() - $ttl) {
                        $state = ['date'=>$date, 'page'=>1, 'stamp'=>$dirty, 'last_id'=>0, 'row'=>self::empty_day($date)];
                        break;
                    }
                }
                if (!$state) { self::publish_woo(); return; }
            }
            $statuses = array_diff(array_keys(wc_get_order_statuses()), ['wc-checkout-draft', 'wc-auto-draft', 'trash']);
            $args = ['type'=>'shop_order', 'status'=>array_values($statuses), 'date_created'=>$state['date'], 'limit'=>self::BATCH_SIZE, 'paginate'=>true, 'orderby'=>'ID', 'order'=>'ASC'];
            $result = wc_get_orders($args + ['page'=>$state['page']]);
            if ($state['page'] === 1) { $state['expected'] = (int) $result->total; }
            if ($state['expected'] !== (int) $result->total) { throw new RuntimeException('Order count changed during a day refresh. Retrying; incomplete totals are not shared.'); }
            foreach ($result->orders as $order) {
                    if ($order->get_id() <= $state['last_id']) { throw new RuntimeException('Pagination changed. Retrying without publishing partial totals.'); }
                    $state['last_id'] = $order->get_id();
                    if ($order->get_currency() !== 'EGP') { throw new RuntimeException('Mixed-currency orders require currency-specific reporting. Nothing was combined.'); }
                    $created = $order->get_date_created();
                    if (!$created) { throw new RuntimeException('An order is missing its created date.'); }
                    $key = wp_date('Y-m-d', $created->getTimestamp(), new DateTimeZone('Africa/Cairo'));
                    if ($key !== $state['date']) { throw new RuntimeException('Order date is outside the requested Cairo day.'); }
                    $state['row']['orders']++;
                    if ($order->get_date_paid()) { $state['row']['paidOrders']++; $state['row']['recordedPaidValue'] += (float) $order->get_total(); }
                    if ($order->has_status('cancelled')) { $state['row']['cancelledOrders']++; }
                    if ($order->has_status('completed')) { $state['row']['completedOrders']++; }
                    $state['row']['refundValue'] += (float) $order->get_total_refunded();
            }
            if ($state['page'] < (int) $result->max_num_pages) {
                $state['page']++;
                update_option('zee_growth_woo_job', $state, false);
            } else {
                $check = wc_get_orders(array_merge($args, ['limit'=>1, 'page'=>1, 'return'=>'ids']));
                if ($state['row']['orders'] !== $state['expected'] || (int) $check->total !== $state['expected'] || (string) get_option('zee_growth_dirty_' . $state['date'], '0') !== $state['stamp']) { throw new RuntimeException('Orders changed during reconciliation. Retrying this day.'); }
                foreach (['recordedPaidValue','refundValue'] as $field) { $state['row'][$field] = round($state['row'][$field], 2); }
                update_option('zee_growth_day_' . $state['date'], ['row'=>$state['row'], 'synced'=>time(), 'stamp'=>$state['stamp']], false);
                delete_option('zee_growth_woo_job');
                self::publish_woo();
            }
            delete_option('zee_growth_woo_error');
            self::schedule_refresh();
        } catch (Throwable $error) {
            delete_option('zee_growth_woo_job');
            update_option('zee_growth_woo_error', sanitize_text_field($error->getMessage()), false);
        } finally { delete_option('zee_growth_woo_lock'); }
    }
    public static function ajax_snapshot() {
        if (!current_user_can(self::CAP)) { wp_send_json_error(['message'=>'Reporting permission required.'], 403); }
        check_ajax_referer('zee-growth-read');
        nocache_headers();
        header('Cache-Control: private, no-store, max-age=0');
        header('X-Robots-Tag: noindex, nofollow');
        $empty = ['status'=>'disconnected', 'lastSync'=>null, 'from'=>null, 'to'=>null];
        $data = ['version'=>1, 'workspace'=>'ZEE', 'environment'=>self::environment(), 'generatedAt'=>gmdate('c'), 'currency'=>'EGP', 'timezone'=>'Africa/Cairo', 'sources'=>array_fill_keys(['ads','woo','events','seo'], $empty), 'ads'=>[], 'commerce'=>[], 'events'=>[], 'seo'=>[]];
        foreach (['ads','events','seo'] as $source) {
            $snapshot = get_option('zee_growth_snapshot_' . $source);
            if (is_array($snapshot) && isset($snapshot['source'], $snapshot['rows'])) { $data['sources'][$source] = $snapshot['source']; $data[$source] = $snapshot['rows']; }
        }
        $woo = get_option('zee_growth_woo_snapshot');
        if (is_array($woo)) { $data['sources']['woo'] = $woo['source']; $data['commerce'] = $woo['rows']; }
        if (!$woo || strtotime($woo['source']['lastSync']) < time() - 300) { self::schedule_refresh(); }
        $data['progress'] = self::progress();
        wp_send_json_success($data);
    }
    public static function routes() {
        register_rest_route('zee-growth/v1', '/ingest/(?P<source>ads|events|seo)', [
            'methods'=>'POST', 'callback'=>[__CLASS__, 'ingest'], 'permission_callback'=>[__CLASS__, 'verify_signature'],
        ]);
    }
    public static function verify_signature(WP_REST_Request $request) {
        $source = $request->get_param('source');
        $key = get_option('zee_growth_key_' . $source);
        $timestamp = $request->get_header('x-zee-timestamp');
        $signature = $request->get_header('x-zee-signature');
        if (!is_ssl() || !$key || !ctype_digit((string) $timestamp) || abs(time() - (int) $timestamp) > 300 || strlen($request->get_body()) > 2097152) {
            return new WP_Error('zee_unauthorized', 'Invalid signed report.', ['status'=>401]);
        }
        $expected = hash_hmac('sha256', $timestamp . '.' . $request->get_body(), $key);
        return hash_equals($expected, (string) $signature) ? true : new WP_Error('zee_unauthorized', 'Invalid signed report.', ['status'=>401]);
    }
    private static function date_valid($value) {
        $d = is_string($value) ? DateTimeImmutable::createFromFormat('!Y-m-d', $value) : false;
        return $d && $d->format('Y-m-d') === $value;
    }
    private static function number($value, $integer = false) {
        if (!is_int($value) && !is_float($value)) { throw new RuntimeException('Numeric metrics are required.'); }
        if (!is_finite((float) $value) || $value < 0 || $value > 1e14 || ($integer && floor($value) != $value)) { throw new RuntimeException('Invalid metric.'); }
        return $value;
    }
    private static function text($value, $limit = 200) {
        if (!is_string($value) || strlen($value) > $limit * 4) { throw new RuntimeException('Invalid text field.'); }
        return sanitize_text_field($value);
    }
    public static function ingest(WP_REST_Request $request) {
        $source = $request->get_param('source');
        $raw = $request->get_json_params();
        try {
            if (!is_array($raw) || ($raw['version'] ?? null) !== 1 || ($raw['currency'] ?? '') !== 'EGP' || ($raw['timezone'] ?? '') !== 'Africa/Cairo' || ($raw['environment'] ?? '') !== self::environment()) { throw new RuntimeException('Report account, environment, currency or time zone is invalid.'); }
            $s = $raw['sources'][$source] ?? [];
            if (($s['status'] ?? '') !== 'connected' || !self::date_valid($s['from'] ?? null) || !self::date_valid($s['to'] ?? null) || $s['from'] > $s['to'] || (strtotime($s['to']) - strtotime($s['from'])) > 730 * 86400 || !isset($s['lastSync']) || !strtotime($s['lastSync']) || strtotime($s['lastSync']) > time() + 300) { throw new RuntimeException('Invalid coverage.'); }
            $clean_source = ['status'=>'connected','from'=>$s['from'],'to'=>$s['to'],'lastSync'=>gmdate('c', strtotime($s['lastSync'])), 'note'=>self::text($s['note'] ?? '', 500)];
            if ($source === 'ads') {
                if (($s['accountId'] ?? '') !== '206-762-3227') { throw new RuntimeException('Wrong Ads account.'); }
                $clean_source['accountId'] = '206-762-3227';
            }
            $types = ['order_placed','payment_recorded','order_completed','order_cancelled','refund_recorded','delivery_confirmed','form_enquiry','whatsapp_click','whatsapp_conversation','phone_click','answered_call','qualified_lead','add_to_cart','begin_checkout'];
            if ($source === 'events') { $clean_source['types'] = array_values(array_intersect($types, $s['types'] ?? [])); }
            $rows = $raw[$source] ?? [];
            if (!is_array($rows) || count($rows) > 10000) { throw new RuntimeException('Use at most 10,000 aggregate records per snapshot.'); }
            $clean = []; $seen = [];
            foreach ($rows as $row) {
                if (!is_array($row)) { throw new RuntimeException('Invalid report row.'); }
                if ($source === 'events') {
                    $type = $row['type'] ?? ''; $at = $row['at'] ?? '';
                    if (!in_array($type, $clean_source['types'], true) || !is_string($at) || !strtotime($at)) { throw new RuntimeException('Invalid event.'); }
                    $date = wp_date('Y-m-d', strtotime($at), new DateTimeZone('Africa/Cairo'));
                    $id = self::text($row['id'] ?? '', 100);
                    $record = ['id'=>$id, 'type'=>$type, 'at'=>gmdate('c', strtotime($at)), 'channel'=>self::text($row['channel'] ?? 'Unknown', 80), 'count'=>self::number($row['count'] ?? null, true)];
                } else {
                    $date = $row['date'] ?? '';
                    $record = ['date'=>$date];
                    $fields = $source === 'ads' ? ['cost','clicks','impressions','conversions','purchases','purchaseValue'] : ['clicks','impressions','position'];
                    foreach ($fields as $field) { $record[$field] = self::number($row[$field] ?? null, in_array($field, ['clicks','impressions'], true)); }
                    $id = $date;
                    if ($source === 'ads') { $record['campaignId'] = self::text($row['campaignId'] ?? '', 50); $record['campaign'] = self::text($row['campaign'] ?? ''); $id .= '|' . $record['campaignId']; }
                }
                if (!$id || isset($seen[$id]) || !self::date_valid($date) || $date < $s['from'] || $date > $s['to']) { throw new RuntimeException('Duplicate row or row outside coverage.'); }
                $seen[$id] = true; $clean[] = $record;
            }
            $old = get_option('zee_growth_snapshot_' . $source);
            if (is_array($old) && strtotime($old['source']['lastSync']) > strtotime($clean_source['lastSync'])) { throw new RuntimeException('An older report cannot overwrite a newer snapshot.'); }
            // Complete snapshots REPLACE instead of incrementing. A signed request replay cannot double-count.
            update_option('zee_growth_snapshot_' . $source, ['source'=>$clean_source,'rows'=>$clean], false);
            return new WP_REST_Response(['ok'=>true, 'source'=>$source, 'rows'=>count($clean)], 200);
        } catch (Throwable $error) { return new WP_Error('zee_invalid_report', $error->getMessage(), ['status'=>400]); }
    }
    public static function cleanup() {
        // Only this plugin's stale imports are removed; store orders are never touched.
        foreach (['ads','events','seo'] as $source) {
            $data = get_option('zee_growth_snapshot_' . $source);
            if (is_array($data) && strtotime($data['source']['lastSync']) < time() - 120 * 86400) { delete_option('zee_growth_snapshot_' . $source); }
        }
    }
}
Zee_Growth_Bridge::boot();
register_activation_hook(__FILE__, ['Zee_Growth_Bridge','activate']);
register_deactivation_hook(__FILE__, ['Zee_Growth_Bridge','deactivate']);
