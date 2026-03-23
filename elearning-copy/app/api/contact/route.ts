import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, phone, message } = body;

        if (!name || !email || !message) {
            return NextResponse.json(
                { error: 'Name, email, and message are required fields.' },
                { status: 400 }
            );
        }

        const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

        if (!GOOGLE_SCRIPT_URL) {
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
            redirect: 'follow',
            body: JSON.stringify({ name, email, phone, message }),
        });

        if (!response.ok) {
            throw new Error('Failed to reach Google Script');
        }

        const text = await response.text();

        let result;
        try {
            result = JSON.parse(text);
        } catch {
            result = { success: true };
        }

        if (result.success || result.result === 'success') {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json(
                { success: false, error: result.error || 'Unknown error' },
                { status: 500 }
            );
        }

    } catch (error) {
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}