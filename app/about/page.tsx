import SectionWrapper from '@/app/components/SectionWrapper';
import { Target, Eye, Users, Award, Heart, CheckCircle, Star, Clock, Calendar, Megaphone, GraduationCap } from 'lucide-react';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "About Us | Cert-Ed Academia",
  description: "Learn about Cert-Ed Academia's mission to provide personalised one-to-one online learning for students across India and GCC.",
};

export default function About() {
    const values = [
        {
            icon: Heart,
            title: "Student-first",
            description: "Every decision is made for the student’s progress and well-being."
        },
        {
            icon: CheckCircle,
            title: "Transparency",
            description: "Clear communication and regular reports for parents."
        },
        {
            icon: Star,
            title: "Quality",
            description: "Experienced tutors and curriculum-aligned lessons."
        },
        {
            icon: Clock,
            title: "Flexibility",
            description: "Timings and learning plans tailored to each family."
        }
    ];

    return (
        <div className="flex flex-col min-h-screen">
            {/* Header Section */}
            <section className="bg-gray-50 text-slate-900 py-10 px-4 text-center">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-extrabold mb-6 text-gray-900 tracking-tight">About Cert-Ed Academia</h1>
                    <p className="text-xl text-gray-600 leading-relaxed font-medium">
                        We provide personalised one-to-one online tuition for students across <strong>India and the GCC</strong>, helping each child reach their academic potential.
                    </p>
                </div>
            </section>

            {/* Mission Section */}
            <SectionWrapper id="mission" className="bg-white">
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1 space-y-6">
                        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-xl mb-4">
                            <Target className="w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-3xl font-bold text-gray-900">Our Mission</h2>
                        <div className="space-y-4">
                            <p className="text-lg text-gray-700 leading-relaxed">
                                Build a collaborative learning space where students, tutors, and mentors grow by sharing knowledge with each other.
                            </p>
                            <p className="text-lg text-gray-700 leading-relaxed">
                                Encourage curiosity-driven learning instead of one-way teaching.
                            </p>
                            <p className="text-lg text-gray-700 leading-relaxed">
                                Create fun, friendly, and engaging classes where tutors guide students like supportive friends.
                            </p>
                            <p className="text-lg text-gray-700 leading-relaxed">
                                Help students develop confidence, understanding, and a genuine love for learning.
                            </p>
                        </div>
                    </div>
                    <div className="flex-1 bg-gradient-to-br from-primary/5 to-secondary/10 rounded-3xl p-8 md:p-12 border border-gray-100 shadow-sm flex items-center justify-center">
                        <div className="text-center">
                            <Users className="w-16 h-16 text-secondary mx-auto mb-4" />
                            <p className="text-2xl font-bold text-gray-800">Transforming Lives Through Education</p>
                        </div>
                    </div>
                </div>
            </SectionWrapper>

            {/* Vision Section */}
            <SectionWrapper id="vision" className="bg-gray-50">
                <div className="flex flex-col md:flex-row-reverse items-center gap-6">
                    <div className="flex-1 space-y-6">
                        <div className="inline-flex items-center justify-center p-3 bg-secondary/10 rounded-xl mb-4">
                            <Eye className="w-8 h-8 text-secondary" />
                        </div>
                        <h2 className="text-3xl font-bold text-gray-900">Our Vision</h2>
                        <p className="text-lg text-gray-700 leading-relaxed">
                            To create a learning journey where curiosity leads the way—empowering students to explore, question, and understand beyond exams.
                        </p>
                    </div>
                    <div className="flex-1 h-64 md:h-80 bg-gradient-to-br from-secondary to-primary rounded-3xl flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform duration-500">
                        <p className="text-white text-2xl font-bold text-center px-8 opacity-90 max-w-lg">
                            "Building confidence and long-term academic success."
                        </p>
                    </div>
                </div>
            </SectionWrapper>

            {/* Values Section */}
            <SectionWrapper id="values" className="bg-white">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Core Values</h2>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        The principles that guide our every interaction with students and parents.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {values.map((value, index) => (
                        <div key={index} className="bg-gray-50 p-6 rounded-xl border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center mb-4 shadow-sm text-primary">
                                <value.icon size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{value.title}</h3>
                            <p className="text-gray-600 font-medium">{value.description}</p>
                        </div>
                    ))}
                </div>
            </SectionWrapper>

            {/* Highlights Section */}
            {/* FUTURE REFERENCE: Highlights Section. Uncomment when ready to use.
            <SectionWrapper id="highlights" className="bg-primary/5">
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Latest Updates & Highlights</h2>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        Stay informed about our upcoming events, admission timelines, and new academic programs.
                    </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    
                    <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-all flex flex-col items-center text-center group">
                        <div className="w-14 h-14 bg-blue-50 text-primary rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <GraduationCap size={28} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Admissions Open 2026</h3>
                        <p className="text-gray-600 mb-4">
                            Enrollments for the upcoming academic year are now open. Secure your child's spot early for preferred timings.
                        </p>
                    </div>

                    
                    <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-all flex flex-col items-center text-center group">
                        <div className="w-14 h-14 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <Calendar size={28} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-3">Upcoming Webinars</h3>
                        <p className="text-gray-600 mb-4">
                            Join our free expert-led webinars on exam preparation strategies for Class 10 & 12 board exams.
                        </p>
                    </div>

                    
                    <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-all flex flex-col items-center text-center group">
                        <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <Megaphone size={28} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-3">New CBSE Batches</h3>
                        <p className="text-gray-600 mb-4">
                            We have launched specialized weekend batches focusing exclusively on previous year question papers.
                        </p>
                    </div>
                </div>
            </SectionWrapper>
            */}

            {/* Team Section */}
            <SectionWrapper id="team" className="bg-gray-50">
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1">
                        <h2 className="text-3xl font-bold text-gray-900 mb-6">Our Team</h2>
                        <p className="text-lg text-gray-700 leading-relaxed mb-6">
                            Our tutors are trained in CBSE & ICSE curricula and selected for teaching clarity, empathy, and the ability to personalise lessons.
                        </p>
                        <p className="text-lg text-gray-700 leading-relaxed">
                            Mentors coordinate learning plans and parent communication, ensuring a seamless and supported educational journey for every family.
                        </p>
                    </div>
                    <div className="flex-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-6 rounded-xl shadow-xl border border-b-[6px] border-r-[6px] border-gray-200 text-center flex flex-col justify-center items-center h-full">
                                <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-3 flex items-center justify-center shrink-0">
                                    <Award className="text-primary w-8 h-8" />
                                </div>
                                <p className="font-bold text-gray-900">Friendly Tutors</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-xl border border-b-[6px] border-r-[6px] border-gray-200 text-center flex flex-col justify-center items-center h-full">
                                <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-3 flex items-center justify-center shrink-0">
                                    <Users className="text-primary w-8 h-8" />
                                </div>
                                <p className="font-bold text-gray-900">Dedicated Mentors</p>
                            </div>
                        </div>
                    </div>
                </div>
            </SectionWrapper>
        </div>
    );
}
