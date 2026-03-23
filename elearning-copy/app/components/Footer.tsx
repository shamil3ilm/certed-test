import Link from 'next/link';

const Footer = () => {
    return (
        <footer className="bg-[#0B1120] text-gray-300 border-t border-gray-800">
            <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-6">Cert-Ed Academia</h3>
                        <p className="text-gray-400 leading-relaxed mb-4">
                            Providing personalised one-to-one online tuition for CBSE & ICSE students (Classes KG - 12).
                        </p>
                        <p className="text-gray-400">
                            Serving students across <strong>India & GCC</strong>.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-lg font-semibold text-white mb-6">Quick Links</h4>
                        <ul className="space-y-3">
                            <li><Link href="/" className="hover:text-secondary transition-colors">Home</Link></li>
                            <li><Link href="/about" className="hover:text-secondary transition-colors">About Us</Link></li>
                            <li><Link href="/classes" className="hover:text-secondary transition-colors">Classes</Link></li>
                            <li><Link href="/blogs" className="hover:text-secondary transition-colors">Blogs</Link></li>
                            <li><Link href="/contact" className="hover:text-secondary transition-colors">Contact Us</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-lg font-semibold text-white mb-6">Contact Info</h4>
                        <ul className="space-y-4 text-gray-400">
                            <li className="flex items-start">
                                <span className="w-20 text-gray-500 font-medium">Email:</span>
                                <a href="mailto:info@certedacademia.com" className="hover:text-white transition-colors break-all">info@certedacademia.com</a>
                            </li>
                            <li className="flex items-start">
                                <span className="w-20 text-gray-500 font-medium">Phone:</span>
                                <div>
                                    <p>+91 7025 237 833</p>
                                    <p>+971 56 890 0796</p>
                                </div>
                            </li>
                        </ul>
                        <div className="mt-6">
                            <Link
                                href="/contact"
                                className="inline-block bg-secondary hover:bg-secondary/90 text-white font-medium py-2 px-6 rounded-lg transition-colors"
                            >
                                Book a Demo
                            </Link>
                        </div>
                    </div>
                </div>
                <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-600 text-sm">
                    &copy; {new Date().getFullYear()} Cert-Ed Academia. Serving students across India and GCC. All rights reserved.
                </div>
            </div>
        </footer>
    );
};

export default Footer;
