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
        const GOOGLE_SCRIPT_URL = process.env.NEXT_PUBLIC_SCRIPT_URL;

        if (!GOOGLE_SCRIPT_URL) {
            console.error('Google Apps Script URL is not configured.');
            return NextResponse.json(
                { success: false, error: 'Server configuration error.' },
                { status: 500 }
            );
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

