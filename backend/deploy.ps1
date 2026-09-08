param(
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [Parameter(Mandatory=$true)][string]$AdsTokenSecret,
  [Parameter(Mandatory=$true)][string]$Region,
  [switch]$ApproveHostingAndPublicEndpoint
)
$ErrorActionPreference = 'Stop'
if (-not $ApproveHostingAndPublicEndpoint) { throw 'Deployment can incur Cloud Run/build costs and exposes an app-authenticated HTTPS endpoint. Review README, then explicitly approve with -ApproveHostingAndPublicEndpoint.' }
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw 'Install Google Cloud CLI and sign in with an approved deployment administrator first.' }
$settings = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json -AsHashtable
$required = @('GOOGLE_WEB_CLIENT_ID','ALLOWED_EMAILS','GOOGLE_ADS_PURCHASE_ACTION_IDS','GA4_PROPERTY_ID')
foreach ($key in $required) { if (-not $settings[$key]) { throw "Missing setting: $key" } }
if ($settings.GOOGLE_CLOUD_PROJECT -ne 'zee-official-489812' -or $settings.GOOGLE_ADS_CUSTOMER_ID -ne '2067623227') { throw 'Deployment is restricted to the approved ZEE project and Ads account.' }
if ($settings.ContainsKey('GOOGLE_ADS_DEVELOPER_TOKEN') -or $settings.ContainsKey('GOOGLE_APPLICATION_CREDENTIALS')) { throw 'Do not put Google credentials or the developer token in this configuration file.' }
if ($AdsTokenSecret -notmatch '^[A-Za-z0-9_-]+$' -or $Region -notmatch '^[a-z]+-[a-z]+[0-9]$') { throw 'Provide a valid secret name and Cloud Run region.' }
$sourcePath = $PSScriptRoot
& gcloud run deploy zee-growth-reporting --project=zee-official-489812 --region=$Region --source=$sourcePath --service-account=new-dashboard-for-zee@zee-official-489812.iam.gserviceaccount.com --env-vars-file=$ConfigPath "--set-secrets=GOOGLE_ADS_DEVELOPER_TOKEN=${AdsTokenSecret}:latest" --allow-unauthenticated --min-instances=0 --max-instances=2 --memory=512Mi --cpu=1 --concurrency=3 --timeout=300
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed. Do not treat the API as live.' }
Write-Output 'Deployment completed. Test approved and unapproved sign-in, then reconcile all three Google reports before accepting the connection.'
