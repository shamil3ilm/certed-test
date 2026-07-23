import type { Metadata } from 'next'
import Link from 'next/link'
import SectionWrapper from '@/app/components/SectionWrapper'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'CBSE Board Exam Preparation Tips | Study Guide',
  description:
    'Top CBSE board exam preparation tips to score high. Learn revision strategies, study plans, and expert guidance.',
}

export default function CbseBoardExamPreparationTips() {
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
              <span>Exam Prep</span>
              <span className="mx-2 text-gray-300">•</span>
              <span className="text-gray-500">Current Date</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
              CBSE Board Exam Preparation Tips: A Smart Study Plan for Class 10 & 12 Students
            </h1>
          </header>

          {/* Blog Content */}
          <article className="prose prose-lg max-w-none text-gray-700 space-y-8 prose-headings:text-gray-900 prose-a:text-primary hover:prose-a:underline prose-li:marker:text-primary">
            <p className="text-xl leading-relaxed">
              Preparing for board exams requires more than just hard work. The most effective{' '}
              <strong>CBSE board exam preparation strategy</strong> involves structured learning, continuous practice,
              regular revision, and timely mock tests. When students follow a systematic approach, preparation becomes
              easier and stress-free.
            </p>

            <p>The preparation process can be divided into four important phases.</p>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">
              Phase 1: Learning the Concepts (Foundation Stage)
            </h2>

            <p>
              This phase forms the base of effective CBSE board exam preparation. When concepts are clearly understood,
              practicing questions and revising becomes much easier.
            </p>

            <h3 className="text-2xl font-semibold mt-8 mb-4">What to Focus On</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Learn every chapter from the basics</li>
              <li>Understand concepts instead of memorizing them</li>
              <li>Use examples to connect concepts with real-life situations</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Must-Do Tasks During This Phase</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Read the NCERT textbook thoroughly</li>
              <li>Understand definitions, explanations, and derivations</li>
              <li>Practice all in-text and exercise questions</li>
              <li>Prepare formula sheets (especially for Maths and Science)</li>
              <li>Create short notes for every chapter</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Why Short Notes Are Important</h3>
            <p>
              Preparing short notes may take time initially, but they save significant time during revision and before
              the final exam.
            </p>

            <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg my-8">
              <h4 className="font-bold text-gray-900 text-lg mb-2">Important Tip:</h4>
              <p className="m-0">
                Do not wait until the entire syllabus is completed before starting practice and revision. Phase 2 and
                Phase 3 should run alongside Phase 1.
              </p>
            </div>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">
              Phase 2: Practice – PYQs and Application-Based Questions
            </h2>

            <p>
              Once a chapter is learned, students should immediately begin practicing different types of questions. This
              helps reinforce concepts and develop problem-solving skills.
            </p>

            <h3 className="text-2xl font-semibold mt-8 mb-4">What to Practice</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Extra questions from the same chapter</li>
              <li>Questions with varying difficulty levels</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Important Question Types</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Multiple Choice Questions (MCQs)</li>
              <li>Assertion and Reason questions</li>
              <li>Very short and short answer questions</li>
              <li>Long answer questions</li>
              <li>Case-based questions</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Key Resources</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Previous Year Questions (PYQs)</li>
              <li>Frequently Asked Questions (FAQs)</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Why This Phase Is Important</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Helps students understand the CBSE exam pattern</li>
              <li>Improves answer-writing skills</li>
              <li>Builds confidence in solving exam-level questions</li>
              <li>Reduces exam anxiety</li>
            </ul>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">
              Phase 3: Revision Strategy (Continuous Strengthening Phase)
            </h2>

            <p>Revision should be a continuous process rather than something done only at the end of the syllabus.</p>
            <p>Students should revise previously learned chapters regularly while continuing to learn new ones.</p>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Effective Revision Methods</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use short notes instead of repeatedly reading textbooks</li>
              <li>Attempt questions first and then review concepts</li>
              <li>Compare answers with the NCERT textbook solutions</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Best Revision Cycle</h3>
            <ol className="list-decimal pl-6 space-y-2 font-medium">
              <li>Quickly revise the short notes</li>
              <li>Attempt questions</li>
              <li>Check answers carefully</li>
              <li>Identify weak areas</li>
              <li>Re-learn only the difficult topics</li>
            </ol>

            <p className="font-medium text-gray-900 mt-4">
              This strategy improves both speed and accuracy during exams.
            </p>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">
              How to Balance Learning, Practice, and Revision
            </h2>

            <p>A structured schedule helps students maintain consistency in preparation.</p>

            <div className="bg-gray-50 rounded-xl p-8 border border-gray-100 my-8">
              <h4 className="font-bold text-gray-900 text-xl mb-4">Example Study Cycle:</h4>
              <ul className="space-y-3">
                <li className="flex items-center text-gray-700">
                  <span className="w-24 font-bold text-secondary">Day 1–2:</span>
                  <span>Learn and understand a new chapter</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <span className="w-24 font-bold text-secondary">Day 3:</span>
                  <span>Practice PYQs and additional questions</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <span className="w-24 font-bold text-secondary">Weekly:</span>
                  <span>Revise chapters learned during the week</span>
                </li>
                <li className="flex items-center text-gray-700">
                  <span className="w-24 font-bold text-secondary">Monthly:</span>
                  <span>Revise older chapters to strengthen retention</span>
                </li>
              </ul>
            </div>

            <p>Following this cycle keeps concepts fresh and reduces last-minute stress.</p>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Phase 4: Mock Tests (Exam Readiness Stage)</h2>

            <p>
              Mock tests are an essential part of CBSE board exam preparation. They should ideally begin 1–1.5 months
              before the final exam.
            </p>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Benefits of Mock Tests</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Improves time management skills</li>
              <li>Builds exam temperament and confidence</li>
              <li>Helps identify weak chapters</li>
              <li>Reduces exam stress and anxiety</li>
            </ul>

            <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg my-8">
              <h4 className="font-bold text-gray-900 text-lg mb-2">Important Tip:</h4>
              <p className="m-0">
                Students should not wait for the entire syllabus to be completed before attempting mock tests.
                Chapter-wise tests can start earlier.
              </p>
            </div>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">
              Preparation Tips for Language Subjects (English, Hindi, and Others)
            </h2>

            <p>
              Language subjects require a different preparation strategy compared to subjects like Maths and Science.
            </p>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Reading and Literature</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Read chapters and poems at least two to three times</li>
              <li>Understand themes, characters, and key ideas</li>
              <li>Highlight important lines and keywords</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Writing Section</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Practice writing formats regularly (letters, articles, notices, reports)</li>
              <li>Follow the correct word limit</li>
              <li>Focus on presentation and clarity</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Grammar Preparation</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Practice grammar rules through questions</li>
              <li>Avoid memorizing rules without application</li>
              <li>Revise commonly made grammar mistakes</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Answer Writing Tips</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Start answers with a clear introduction</li>
              <li>Support points with examples from the text</li>
              <li>Avoid unnecessary long explanations</li>
            </ul>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Important CBSE Board Exam Preparation Tips</h2>

            <ul className="list-disc pl-6 space-y-2 font-medium bg-gray-50 p-8 rounded-xl border border-gray-100 mb-8">
              <li>Avoid using too many reference books</li>
              <li>Choose one reliable book and complete it thoroughly</li>
              <li>Focus on smart study techniques rather than only hard work</li>
              <li>Prepare short notes during learning or first revision</li>
              <li>Analyze mistakes after every test</li>
              <li>Avoid last-minute syllabus rush</li>
              <li>Maintain good sleep and physical health</li>
            </ul>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">
              How Personalized Online Tuition Helps in CBSE Exam Preparation
            </h2>

            <p>Personalized learning can significantly improve exam preparation.</p>
            <p>
              One-to-one{' '}
              <Link href="/contact" className="text-secondary font-semibold">
                online tuition
              </Link>{' '}
              allows students to receive individual attention, clear doubts quickly, and follow a structured study plan.
            </p>

            <p className="font-semibold text-gray-900 mt-6 mb-4">Benefits include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Customized study plans based on student performance</li>
              <li>Immediate doubt clarification</li>
              <li>Regular practice tests and feedback</li>
              <li>Improved confidence and academic performance</li>
            </ul>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Final Thoughts</h2>

            <p>CBSE board exam preparation is not about studying longer hours but about studying systematically.</p>
            <p>
              When students learn concepts clearly, practice regularly, revise consistently, and attempt mock tests,
              preparation becomes much more effective.
            </p>
            <p className="text-xl font-bold text-secondary mt-8 italic text-center">
              Consistency, clarity, and confidence are the true keys to success in CBSE board exams.
            </p>
          </article>

          {/* Quick CTA */}
          <div className="mt-16 bg-gradient-to-br from-primary to-[#0f365c] rounded-2xl p-8 md:p-12 text-center text-white shadow-xl">
            <h3 className="text-3xl font-bold mb-4">Ready to boost your exam scores?</h3>
            <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
              Join our personalized one-to-one CBSE & ICSE classes today and get a customized study plan tailored for
              your success.
            </p>
            <Link
              href="/contact"
              className="inline-block bg-white text-primary font-bold px-8 py-4 rounded-full hover:bg-gray-100 transition-colors shadow-sm text-lg"
            >
              Book a Demo Session
            </Link>
          </div>
        </div>
      </SectionWrapper>
    </div>
  )
}
