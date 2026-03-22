import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, phone, message } = body;

        // Validate required fields
        if (!name || !email || !message) {
            return NextResponse.json(
                { error: 'Name, email, and message are required fields.' },
                { status: 400 }
            );
        }

        // Google Apps Script Web App URL
        // Best practice: Store this in an environment variable, e.g., process.env.GOOGLE_SHEET_WEB_APP_URL
        // For now, PLEASE REPLACE THIS CONSTANT with your deployed Web App URL
        const GOOGLE_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || 'YOUR_DEPLOYED_WEB_APP_URL_HERE';

        if (GOOGLE_SCRIPT_URL === 'YOUR_DEPLOYED_WEB_APP_URL_HERE') {
            console.warn('Google Apps Script URL is not configured.');
            // You might want to return an error here if strict config is needed
        }

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Google Apps Script requires following redirects for the Web App
            redirect: 'follow',
            body: JSON.stringify({ name, email, phone, message }),
        });

        const result = await response.json();

        if (result.success || result.result === 'success') {
            return NextResponse.json({ success: true });
        } else {
            console.error('Google Apps Script Error:', result);
            return NextResponse.json(
                { success: false, error: 'Failed to submit data to Google Sheets: ' + (result.error || 'Unknown error') },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('Server Error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
