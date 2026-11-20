# 02 — Putting the pilot online (Google Cloud, Montréal)

Project: `fifth-handbook-515310-b7` · Region: `northamerica-northeast1` (Montréal)

Everything below is typed in **Cloud Shell**, the terminal built into the Google Cloud console
(icon `>_` at the top right of console.cloud.google.com). Nothing to install on your computer.
Run the steps in order; each one says what you should see.

| Piece | Service | Approx. cost |
|---|---|---|
| The app | Cloud Run (`reservation`) | Within the free tier at pilot volume |
| The database | Cloud SQL PostgreSQL 16, smallest shared machine, daily backups | Roughly $10–15 / month |
| Passwords and keys | Secret Manager | A few cents |

## Step 1 — Settings for this session

```bash
gcloud config set project fifth-handbook-515310-b7
export PROJECT=fifth-handbook-515310-b7 REGION=northamerica-northeast1
gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com
```
Expect: `Operation ... finished successfully` (can take a minute).

## Step 2 — The database (about 10 minutes, mostly waiting)

```bash
gcloud sql instances create reservation-db --database-version=POSTGRES_16 --region=$REGION \
  --edition=ENTERPRISE --tier=db-f1-micro --storage-size=10 --availability-type=zonal \
  --backup-start-time=08:00 --enable-point-in-time-recovery
gcloud sql databases create reservation --instance=reservation-db
export DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')
gcloud sql users create app --instance=reservation-db --password="$DB_PASS"
```
Expect: the instance shows `RUNNABLE`, then `Created database` and `Created user`.
Backups run daily at 03:00 Montréal time (08:00 UTC).

## Step 3 — Secrets (never typed into chat or code)

```bash
printf "postgres://app:${DB_PASS}@/reservation?host=/cloudsql/${PROJECT}:${REGION}:reservation-db" \
  | gcloud secrets create DATABASE_URL --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create SESSION_SECRET --data-file=-
read -s -p "Code de l'équipe (au moins 6 chiffres) : " PIN; echo
printf "%s" "$PIN" | gcloud secrets create STAFF_PIN --data-file=-
```
Expect: three `Created version [1]` lines. The team code is the one Julian's team will type on the tablet.

## Step 4 — An identity for the app, with only the rights it needs

```bash
gcloud iam service-accounts create reservation-run --display-name="Reservation app"
export SA=reservation-run@${PROJECT}.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/cloudsql.client
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
```

## Step 5 — Get the code into Cloud Shell

```bash
gh auth login        # choose GitHub.com, HTTPS, "Login with a web browser", enter the code shown
gh repo clone jfstrayer-cell/reservation-tool && cd reservation-tool
```

## Step 6 — Build and deploy (about 5 minutes)

```bash
gcloud run deploy reservation --source . --region=$REGION \
  --service-account=$SA \
  --add-cloudsql-instances=${PROJECT}:${REGION}:reservation-db \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,STAFF_PIN=STAFF_PIN:latest,SESSION_SECRET=SESSION_SECRET:latest \
  --allow-unauthenticated --min-instances=0 --max-instances=2 --memory=512Mi
```
If asked to create an Artifact Registry repository, answer `Y`.
Expect at the end: `Service URL: https://reservation-….run.app`.

On start, the app creates its tables and loads Les Oiseaux's configuration (tables A1–A12, hours) if they aren't there yet.

## Step 7 — Check

- Open `https://reservation-….run.app/api/health` → `{"ok":true}`.
- Open `https://reservation-….run.app/staff` → login page; enter the team code → empty day for Les Oiseaux.

## Later (not needed for the first test)

- `reserver.lesoiseaux.ca` pointing to the app (DNS record at your domain provider).
- Automatic deploy from GitHub after each merge.
- `--min-instances=1` before the switch from Spectra, so the first request of the evening never waits for a cold start (adds a few dollars a month).
- Uptime alert to JF's phone using `/api/health`.

## Updating the app after a merge (until automatic deploys are set up)

```bash
cd ~/reservation-tool && git pull && gcloud run deploy reservation --source . --region=northamerica-northeast1
```
