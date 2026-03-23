import type { Metadata } from 'next';
import Link from 'next/link';
import SectionWrapper from '@/app/components/SectionWrapper';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: "CBSE & ICSE Answer Writing Tips | Score Better Marks",
  description: "Improve your answer writing skills for CBSE and ICSE exams with these practical tips and strategies.",
};

export default function AnswerWritingTipsArticle() {
    return (
        <div className="flex flex-col min-h-screen bg-white">
            <SectionWrapper>
                <div className="max-w-4xl mx-auto">
                    {/* Back Button */}
                    <div className="mb-8">
                        <Link href="/blogs" className="inline-flex items-center text-primary hover:underline font-medium">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Blogs
                        </Link>
                    </div>

                    {/* Blog Header */}
                    <header className="mb-12 border-b border-gray-100 pb-8">
                        <div className="flex items-center text-sm text-secondary font-semibold uppercase tracking-wide mb-4">
                            <span>Exam Tricks</span>
                            <span className="mx-2 text-gray-300">•</span>
                            <span className="text-gray-500">Current Date</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
                            CBSE & ICSE Answer Writing Tips: Write Smart and Score More in Board Exams
                        </h1>
                    </header>

                    {/* Blog Content */}
                    <article className="prose prose-lg max-w-none text-gray-700 space-y-8 prose-headings:text-gray-900 prose-a:text-primary hover:prose-a:underline prose-li:marker:text-primary">

                        <p className="text-xl leading-relaxed">
                            Every year, lakhs of students appear for CBSE and ICSE board exams believing that knowing the correct answers is enough to score high marks.
                        </p>

                        <p>
                            However, experienced teachers and examiners often explain that the way answers are written plays an equally important role in scoring well. Within the first few pages of an answer sheet, examiners usually form an impression that influences the overall evaluation.
                        </p>

                        <p className="font-medium text-gray-900">
                            This means students must not only know the answers but also learn how to present them clearly and effectively during board exams.
                        </p>

                        <hr className="my-10 border-gray-200" />

                        <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">First Impression Matters in Board Exams</h2>

                        <p>
                            The presentation of an answer sheet is the first thing an examiner notices.
                        </p>

                        <p>
                            A neat and well-structured answer sheet makes it easier for examiners to check answers quickly and award marks confidently.
                        </p>

                        <h3 className="text-2xl font-semibold mt-8 mb-4">How to Create a Good First Impression</h3>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Maintain neat and legible handwriting</li>
                            <li>Leave proper spacing between answers</li>
                            <li>Use headings and subheadings where needed</li>
                            <li>Avoid overcrowding the page</li>
                        </ul>

                        <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg my-6">
                            <p className="m-0 font-medium text-gray-900">A clean and organized answer sheet immediately creates a positive impression.</p>
                        </div>

                        <hr className="my-10 border-gray-200" />

                        <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Write Clear Question Numbers</h2>

                        <p>
                            Writing the correct question number and subpart is extremely important in CBSE and ICSE board exams.
                        </p>

                        <p>
                            Incorrect numbering may confuse examiners and sometimes lead to answers being overlooked.
                        </p>

                        <h3 className="text-2xl font-semibold mt-8 mb-4">Best Practices for Question Numbering</h3>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Write the correct question number clearly</li>
                            <li>Mention subparts like (a), (b), (c) properly</li>
                            <li>Leave a line before starting the next answer</li>
                        </ul>

                        <p className="font-semibold text-gray-900 mt-4 italic">Even small habits like proper numbering can help secure marks.</p>

                        <hr className="my-10 border-gray-200" />

                        <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Use Keywords to Highlight Important Concepts</h2>

                        <p>
                            Keywords play a crucial role in board exam answer writing.
                        </p>

                        <p>
                            Examiners often look for specific terms that show the student understands the concept clearly.
                        </p>

                        <h3 className="text-2xl font-semibold mt-8 mb-4">How to Use Keywords Effectively</h3>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Underline important terms and concepts</li>
                            <li>Highlight definitions or key phrases</li>
                            <li>Avoid underlining entire sentences</li>
                        </ul>

                        <div className="bg-gray-50 rounded-xl p-6 border border-gray-100 my-6">
                            <p className="font-medium text-gray-800 m-0">💡 Keywords act like signals for examiners and make answers easier to evaluate.</p>
                        </div>

                        <hr className="my-10 border-gray-200" />

                        <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Show Step-by-Step Logic in Problem Solving</h2>

                        <p>
                            In subjects like Mathematics and Science, marks are awarded not only for the final answer but also for the steps used to reach the solution.
                        </p>

                        <h3 className="text-2xl font-semibold mt-8 mb-4">Why Step-by-Step Solutions Matter</h3>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Each correct step can earn marks</li>
                            <li>Examiners can understand the student's thinking process</li>
                            <li>Even if the final answer is incorrect, partial marks may still be awarded</li>
                        </ul>

                        <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg my-6">
                            <p className="m-0 font-bold text-green-900">Always show calculations, formulas, and logical steps clearly.</p>
                        </div>

                        <hr className="my-10 border-gray-200" />

                        <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Use Diagrams and Examples Whenever Possible</h2>

                        <p>
                            Diagrams make answers clearer and help students explain concepts more effectively.
                        </p>

                        <p>They also help examiners understand the answer quickly.</p>

                        <h3 className="text-2xl font-semibold mt-8 mb-4">Tips for Drawing Effective Diagrams</h3>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Draw neat and properly labeled diagrams</li>
                            <li>Label parts on the right side for clarity</li>
                            <li>Use a pencil for drawing diagrams</li>
                            <li>Write a short explanation below the diagram</li>
                        </ul>

                        <p className="font-semibold text-gray-900 mt-4">A well-drawn diagram with correct labels can significantly improve the quality of an answer.</p>

                        <hr className="my-10 border-gray-200" />

                        <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">How to Write Distinguish or Difference Answers</h2>

                        <p>
                            Many board exam questions ask students to distinguish between two concepts.
                        </p>

                        <p>
                            The best way to answer such questions is by using a table format.
                        </p>

                        <h3 className="text-2xl font-semibold mt-8 mb-4">Effective Table Format for Distinguish Questions</h3>
                        <p className="mb-4">Write answers in two columns:</p>

                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse border border-gray-200 my-4 bg-white">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="border border-gray-200 px-6 py-3 text-left font-bold text-gray-900">Concept A</th>
                                        <th className="border border-gray-200 px-6 py-3 text-left font-bold text-gray-900">Concept B</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border border-gray-200 px-6 py-4">Difference based on definition</td>
                                        <td className="border border-gray-200 px-6 py-4">Difference based on definition</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-gray-200 px-6 py-4">Difference based on structure</td>
                                        <td className="border border-gray-200 px-6 py-4">Difference based on structure</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-gray-200 px-6 py-4">Difference based on function or example</td>
                                        <td className="border border-gray-200 px-6 py-4">Difference based on function or example</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <p className="font-semibold text-gray-900 mt-4 italic">Each correct difference usually carries one mark, so clarity is essential.</p>

                        <hr className="my-10 border-gray-200" />

                        <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Manage Time So Every Answer Gets Attention</h2>

                        <p>
                            Every answer in CBSE and ICSE board exams is evaluated with equal importance.
                        </p>

                        <p>
                            Students should ensure that they manage their time properly so that all questions are attempted.
                        </p>

                        <h3 className="text-2xl font-semibold mt-8 mb-4">Time Management Tips During Exams</h3>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Divide time according to marks allotted to each question</li>
                            <li>Avoid spending too much time on one difficult question</li>
                            <li>Keep 10 minutes at the end to review answers</li>
                        </ul>

                        <p className="font-semibold text-gray-900 mt-4">Completing the paper calmly increases the chances of scoring higher marks.</p>

                        <hr className="my-10 border-gray-200" />

                        <div className="border border-secondary/30 bg-secondary/5 rounded-2xl p-8 text-center my-12 shadow-sm">
                            <h2 className="text-3xl font-bold text-secondary mb-4">Write Smart to Score More</h2>
                            <p className="text-lg text-gray-800 mb-6">
                                Students often focus only on studying hard, but writing smartly is equally important during exams.
                                The right method of writing answers can make a significant difference in final scores.
                            </p>
                            <p className="font-medium text-gray-900">Remember the golden rule of board exams:</p>
                            <p className="text-2xl font-bold text-primary mt-2">Marks follow method.</p>
                        </div>

                        <hr className="my-10 border-gray-200" />

                        <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Conclusion</h2>

                        <p>
                            Success in CBSE and ICSE board exams is not just about knowing the correct answers but also about presenting them effectively.
                        </p>

                        <p>
                            When students maintain neatness, highlight keywords, show logical steps, and use diagrams appropriately, their answers become clearer and easier for examiners to evaluate.
                        </p>

                        <p>
                            By following these simple answer writing tips, students can transform their knowledge into higher marks and better exam results. For more tailored exam writing strategies or concept help, our <Link href="/contact" className="font-medium">personalized one-to-one online tuition</Link> ensures you master the method to score top marks.
                        </p>

                    </article>

                    {/* Quick CTA */}
                    <div className="mt-16 bg-gradient-to-br from-primary to-[#0f365c] rounded-2xl p-8 md:p-12 text-center text-white shadow-xl">
                        <h3 className="text-3xl font-bold mb-4">Want Personalised Coaching for Boards?</h3>
                        <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
                            Learn more about our dedicated sessions focusing on exam presentation and syllabus coverage for CBSE & ICSE boards.
                        </p>
                        <Link href="/contact" className="inline-block bg-white text-primary font-bold px-8 py-4 rounded-full hover:bg-gray-100 transition-colors shadow-sm text-lg">
                            Request a Demo Class
                        </Link>
                    </div>

                </div>
            </SectionWrapper>
        </div>
    );
}
