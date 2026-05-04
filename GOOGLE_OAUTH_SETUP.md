# Google OAuth Setup Guide

To use this application on Vercel, you must register your production URL in your Google Cloud Console.

## 1. Access Google Cloud Console
Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).

## 2. Edit Your OAuth 2.0 Client ID
Find your "OAuth 2.0 Client IDs" and click on the edit icon for the one used by this app.

## 3. Add Authorized Redirect URIs
In the **Authorized redirect URIs** section, add the following URL:

`https://tharcuisine-inventory-nl4lk9jx6-uthpakhis-projects.vercel.app/api/auth/callback`

> [!IMPORTANT]
> If you are testing locally or on AI Studio, ensure you also have those URLs added:
> - `https://ais-dev-ndx4cqeon4aqd4xqb6rwpx-871089165690.asia-southeast1.run.app/api/auth/callback`
> - `http://localhost:3000/api/auth/callback`

## 4. Save Changes
Click **Save** at the bottom. It may take a few minutes for the changes to propagate.

## 5. Troubleshooting
If you still see the `redirect_uri_mismatch` error:
1. Ensure the URL in step 3 matches EXACTLY (including `https://` and `/api/auth/callback`).
2. Clear your browser cache or try an Incognito window.
3. Make sure your `GOOGLE_CLIENT_ID` in Vercel environment variables matches the one you just edited.
