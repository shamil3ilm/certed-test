'use client';

import SectionWrapper from '@/app/components/SectionWrapper';
import { GENERIC_ERROR_MESSAGE } from '@/lib/api/messages';
import { Mail, Phone, Send, Loader2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import Image from 'next/image';

export default function Contact() {

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        countryCode: '+91',
        phone: '',
        message: '',
        website: '' // honeypot — stays empty for real users
    });
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [id]: value
        }));
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMessage('');

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    phone: formData.phone ? `${formData.countryCode} ${formData.phone}` : ''
                }),
            });

            const result = await response.json();

            if (result.success) {
                setStatus('success');
                setFormData({ name: '', email: '', countryCode: '+91', phone: '', message: '', website: '' });
                // Reset success message after 5 seconds
                setTimeout(() => setStatus('idle'), 5000);
            } else {
                setStatus('error');
                setErrorMessage(result.error || GENERIC_ERROR_MESSAGE);
            }
        } catch (error) {
            setStatus('error');
            setErrorMessage('Failed to send message. Please try again later.');
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            <SectionWrapper>
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Get in Touch</h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Have questions about our curriculum or pricing? We are here to help you.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">

                    {/* Contact Information & Map */}
                    <div className="bg-primary text-white p-8 md:p-12 flex flex-col justify-between">
                        <div>
                            <h2 className="text-2xl font-bold mb-8">Contact Information</h2>
                            <div className="space-y-6">
                                <div className="flex items-start">
                                    <Mail className="w-6 h-6 mr-4 mt-1 opacity-80" />
                                    <div>
                                        <h3 className="font-semibold text-lg">Email</h3>
                                        <a href="mailto:info@certedacademia.com" className="text-blue-100 hover:underline">info@certedacademia.com</a>
                                    </div>
                                </div>
                                <div className="flex items-start">
                                    <Phone className="w-6 h-6 mr-4 mt-1 opacity-80" />
                                    <div>
                                        <h3 className="font-semibold text-lg">Phone</h3>
                                        <a href="tel:+917025237833" className="block text-blue-100 hover:underline">+91 7025 237 833</a>
                                        <a href="tel:+971568900796" className="block text-blue-100 hover:underline">+971 56 890 0796</a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Admission Image */}
                        <div className="mt-12 w-[calc(100%+2rem)] -ml-4 md:w-[calc(100%+3rem)] md:-ml-6 relative h-[500px] rounded-xl overflow-hidden shadow-lg">
                            <Image
                                src="/online-tuition-enquiry-form-cbse-icse-india-gcc.webp"
                                alt="Student enrolling for online tuition classes for CBSE and ICSE students in India and GCC"
                                fill
                                className="w-full h-auto object-contain"
                            />
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className="p-8 md:p-12">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Send us a Message</h2>
                        {status === 'success' ? (
                            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-8 rounded-lg text-center">
                                <h3 className="text-xl font-bold mb-2">Message Sent!</h3>
                                <p>Thank you for contacting us. We will get back to you within 24 hours.</p>
                                <button
                                    onClick={() => setStatus('idle')}
                                    className="mt-4 text-green-700 underline font-medium hover:text-green-800"
                                >
                                    Send another message
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-8">
                                {status === 'error' && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                        {errorMessage}
                                    </div>
                                )}
                                {/* Honeypot: off-screen, hidden from humans — bots that fill it are dropped server-side. */}
                                <input
                                    type="text"
                                    id="website"
                                    value={formData.website}
                                    onChange={handleChange}
                                    tabIndex={-1}
                                    autoComplete="off"
                                    aria-hidden="true"
                                    className="absolute left-[-9999px] h-0 w-0 opacity-0"
                                />
                                    <div>
                                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                        <input
                                            type="text"
                                            id="name"
                                            value={formData.name}
                                            onChange={handleChange}
                                            required
                                            disabled={status === 'loading'}
                                            className="w-full px-4 py-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                        <div className="flex bg-white rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent transition-all overflow-hidden">
                                            <div className="flex items-center pl-2 pr-1 border-r border-gray-200 bg-gray-50 flex-shrink-0">
                                                <select
                                                    id="countryCode"
                                                    value={formData.countryCode}
                                                    onChange={handleChange}
                                                    disabled={status === 'loading'}
                                                    className="bg-transparent border-none outline-none text-gray-700 text-base focus:ring-0 cursor-pointer disabled:cursor-not-allowed font-medium w-20 px-1"
                                                >
                                                    <option value="+91">+91</option>
                                                    <option value="+971">+971</option>
                                                    <option value="+973">+973</option>
                                                    <option value="+965">+965</option>
                                                    <option value="+968">+968</option>
                                                    <option value="+974">+974</option>
                                                    <option value="+966">+966</option>
                                                    <option value="+1">+1</option>
                                                    <option value="+44">+44</option>
                                                    <option value="+61">+61</option>
                                                </select>
                                            </div>
                                            <input
                                                type="tel"
                                                id="phone"
                                                value={formData.phone}
                                                onChange={handleChange}
                                                disabled={status === 'loading'}
                                                className="w-full px-4 py-4 bg-transparent border-none outline-none placeholder-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                placeholder="9876543210"
                                            />
                                        </div>
                                    </div>
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        id="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                        disabled={status === 'loading'}
                                        className="w-full px-4 py-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                        placeholder="john@example.com"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">Your Message</label>
                                    <textarea
                                        id="message"
                                        value={formData.message}
                                        onChange={handleChange}
                                        rows={6}
                                        required
                                        disabled={status === 'loading'}
                                        className="w-full px-4 py-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-gray-400 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                                        placeholder="Maths Class 10 Admission enquiry"
                                    ></textarea>
                                </div>
                                <button
                                    type="submit"
                                    disabled={status === 'loading'}
                                    className="w-full bg-primary hover:bg-[#0f365c] text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:bg-primary/40 disabled:cursor-not-allowed"
                                >
                                    {status === 'loading' ? (
                                        <>Sending... <Loader2 className="w-5 h-5 animate-spin" /></>
                                    ) : (
                                        <>Send Message <Send size={18} /></>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </SectionWrapper>
        </div>
    );
}
