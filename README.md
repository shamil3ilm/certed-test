# Cert-Ed Academia Website

This is the official website for Cert-Ed Academia, built using Next.js and deployed on Vercel.

## Overview

The platform provides information about personalized one-to-one online tuition for CBSE & ICSE students from KG to Class 12. It includes enquiry forms, blogs, and structured academic resources.

## Tech Stack

- Next.js (Frontend Framework)
- React
- Tailwind CSS
- Vercel (Deployment & Hosting)
- Google Apps Script (Form handling & email automation)
- Google Sheets (Data storage)

## Features

- Responsive and SEO-friendly website
- Student enquiry form with automated email responses
- Blog section with educational content
- Optimized performance using Next.js

## Deployment

The website is deployed on Vercel and connected to a custom domain:

👉 https://certedacademia.com

## Form Handling

- Form submissions are stored in Google Sheets
- Automated emails are sent to both users and the company
- No API keys are exposed in the repository

## Future Enhancements

- Provide worksheets and quizzes for Class 10 & 12
- Regular blog updates for SEO growth

## ⚙️ Local Setup

1. Copy `.env.example` to `.env.local` and add your Google Script URL:
```bash
cp .env.example .env.local
```

2. Install dependencies and start the server:
```bash
npm install
npm run dev
```
