import type { Metadata } from 'next'
import Link from 'next/link'
import SectionWrapper from '@/app/components/SectionWrapper'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'How to Use Study Leave Effectively | Exam Preparation Guide',
  description:
    'Learn how to utilise study leave effectively with proper planning, revision techniques, and time management strategies.',
}

export default function StudyLeaveExamGapArticle() {
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
              <span>Study Tips</span>
              <span className="mx-2 text-gray-300">•</span>
              <span className="text-gray-500">Current Date</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
              How to Utilise Study Leave During Exams: A Smart Exam Gap Study Plan
            </h1>
          </header>

          {/* Blog Content */}
          <article className="prose prose-lg max-w-none text-gray-700 space-y-8 prose-headings:text-gray-900 prose-a:text-primary hover:prose-a:underline prose-li:marker:text-primary">
            <p className="text-xl leading-relaxed">
              Board exams are not only about preparation before the exams begin. The study leave or exam gaps between
              two exams play a crucial role in improving performance. When used properly, these gaps can help students
              revise efficiently, reduce stress, and enter the exam hall with confidence.
            </p>

            <p>
              This creative guidance plan helps students convert exam gaps into productive revision time without burnout
              or panic.
            </p>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">
              Introduction: Turning Exam Gaps into Opportunities
            </h2>

            <p>
              Exams test knowledge, but <strong>how to utilise study leave during exams</strong> often determines their
              final performance.
            </p>

            <p>The goal of this study leave strategy is to help students:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use exam gaps productively</li>
              <li>Revise smartly instead of studying endlessly</li>
              <li>Manage stress effectively</li>
              <li>Maintain good health and sleep</li>
              <li>Build confidence before each exam</li>
            </ul>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Understanding Exam Gaps</h2>

            <p>Not all exam gaps are the same. Each type of gap requires a different study strategy.</p>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Short Gap (1 Day)</h3>
            <p>Short gaps should focus mainly on revision.</p>
            <p className="font-semibold text-gray-900">What to do:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Revise important formulas, definitions, and key concepts</li>
              <li>Quickly review previous mistakes</li>
              <li>Practice a few exam-pattern questions</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Medium Gap (2–3 Days)</h3>
            <p>Medium gaps allow a balance between revision and practice.</p>
            <p className="font-semibold text-gray-900">What to do:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Revise chapters systematically</li>
              <li>Practice previous year questions</li>
              <li>Work on weak areas</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Long Gap (4+ Days)</h3>
            <p>Long gaps provide an opportunity for deeper revision.</p>
            <p className="font-semibold text-gray-900">What to do:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Revise difficult chapters</li>
              <li>Practice full-length mock tests</li>
              <li>Strengthen conceptual understanding</li>
            </ul>

            <p className="bg-gray-50 border-l-4 border-gray-400 p-4 italic">
              Using the same routine for all types of gaps can reduce productivity. Students should adjust their
              strategy based on the length of the gap.
            </p>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Subject-Based Strategy During Exam Gaps</h2>

            <p>Different subjects require different preparation approaches.</p>

            <h3 className="text-2xl font-semibold mt-8 mb-4 text-green-700">Easy or Scoring Subjects</h3>
            <p>
              <strong className="text-gray-900">Goal:</strong> Maintain accuracy and improve answer presentation.
            </p>
            <p className="font-semibold text-gray-900 mt-4">What to focus on:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Revise key terms, definitions, and diagrams</li>
              <li>Practice writing 2–3 answers daily</li>
              <li>Focus on neat handwriting, headings, and underlining</li>
            </ul>
            <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg my-6">
              <h4 className="font-bold text-gray-900 text-lg mb-2">Important Tip:</h4>
              <p className="m-0">
                Avoid overstudying these subjects. Confidence and accuracy are more important than excessive revision.
              </p>
            </div>

            <h3 className="text-2xl font-semibold mt-8 mb-4 text-blue-700">Moderate Difficulty Subjects</h3>
            <p>
              <strong className="text-gray-900">Goal:</strong> Improve concept clarity and formula retention.
            </p>
            <p className="font-semibold text-gray-900 mt-4">What to focus on:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Revise formulas and derivations</li>
              <li>Practice numericals step-by-step</li>
              <li>Solve previous year questions</li>
              <li>Watch short concept recap videos (maximum 20 minutes)</li>
            </ul>
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-100 my-6">
              <p className="font-bold text-secondary mb-2">Study Trick:</p>
              <p className="mb-4">
                Teach the answer aloud to yourself as if you are the teacher. This strengthens understanding and memory.
              </p>
              <p className="font-bold text-secondary mb-2">Another useful trick:</p>
              <p>Write all formulas on one page and revise them every morning and night.</p>
            </div>

            <h3 className="text-2xl font-semibold mt-8 mb-4 text-red-700">Hard or Fear Subjects</h3>
            <p>
              <strong className="text-gray-900">Goal:</strong> Reduce fear and increase accuracy.
            </p>
            <p className="font-semibold text-gray-900 mt-4">What to focus on:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Practice only important questions instead of the entire textbook</li>
              <li>Review mistakes from previous tests</li>
              <li>Solve 3–5 high-quality questions daily</li>
            </ul>
            <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg my-6">
              <h4 className="font-bold text-gray-900 text-lg mb-2">Important Rule:</h4>
              <p className="m-0 text-red-900">
                Accuracy is more important than quantity. One correct answer builds more confidence than several rushed
                attempts.
              </p>
            </div>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Smart Study Plan for Exam Gaps</h2>

            <p>Following a structured daily routine can significantly improve productivity during study leave.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                <h3 className="text-xl font-bold text-secondary mb-4 flex items-center">
                  ☀️ Morning <span className="text-sm font-normal text-gray-500 ml-2">(High Focus Zone)</span>
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-sm">
                  <li>Study difficult subjects</li>
                  <li>Practice numericals or writing answers</li>
                  <li>Solve important problems</li>
                </ul>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                <h3 className="text-xl font-bold text-secondary mb-4 flex items-center">
                  🌤️ Afternoon <span className="text-sm font-normal text-gray-500 ml-2">(Low Energy Zone)</span>
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-sm">
                  <li>Revise formulas or concepts for about 30 minutes</li>
                  <li>Review short notes</li>
                  <li>Focus on lighter topics</li>
                </ul>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                <h3 className="text-xl font-bold text-secondary mb-4 flex items-center">
                  🌆 Evening <span className="text-sm font-normal text-gray-500 ml-2">(Active Recall Zone)</span>
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-sm">
                  <li>Quickly revise what was studied earlier in the day</li>
                  <li>Practice weak areas</li>
                  <li>Review diagrams or maps</li>
                </ul>
              </div>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                <h3 className="text-xl font-bold text-secondary mb-4 flex items-center">
                  🌙 Night <span className="text-sm font-normal text-gray-500 ml-2">(Memory Lock Zone)</span>
                </h3>
                <ul className="list-disc pl-6 space-y-2 text-sm">
                  <li>Avoid heavy learning</li>
                  <li>Do light reading or concept recap</li>
                  <li>Watch short revision videos if required</li>
                </ul>
              </div>
            </div>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Power Breaks: Improving Focus and Memory</h2>

            <p>Breaks are not a waste of time. They are essential for maintaining focus and mental balance.</p>

            <div className="flex flex-col md:flex-row gap-8 my-8">
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-4 text-red-600">Breaks to Avoid</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Excessive mobile scrolling</li>
                  <li>Overthinking exam results</li>
                  <li>Comparing performance with others</li>
                </ul>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-4 text-green-600">Productive Breaks</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Take a 10-minute walk</li>
                  <li>Do stretching exercises</li>
                  <li>Listen to calm music</li>
                  <li>Practice deep breathing</li>
                  <li>Spend time talking with family</li>
                </ul>
              </div>
            </div>

            <div className="bg-primary text-white p-6 rounded-xl text-center shadow-lg my-8">
              <h4 className="font-bold text-xl mb-2 text-yellow-300">Golden Rule</h4>
              <p className="text-lg mb-0 font-medium tracking-wide">
                After every 90 minutes of focused study, take a 10–15 minute break.
              </p>
              <p className="text-sm opacity-90 mt-2">This improves memory, focus, and emotional balance.</p>
            </div>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Health and Wellness During Study Leave</h2>

            <p>Maintaining good health during exams helps students stay calm and focused.</p>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Food Tips</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Eat light but nutritious meals</li>
              <li>Include fruits, nuts, curd, and eggs in the diet</li>
              <li>Avoid heavy junk food before study sessions</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Physical Activity</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Do 15–20 minutes of physical activity daily</li>
              <li>Walking, stretching, or yoga helps relax the mind</li>
            </ul>

            <p className="font-medium text-gray-900 mt-4 italic text-center">
              A healthy body supports a calm mind and better academic performance.
            </p>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Stress-Free Exam Strategy</h2>

            <p>Managing stress is as important as preparing academically.</p>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Before the Next Exam</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Avoid discussing answers after finishing an exam</li>
              <li>Do not calculate marks immediately</li>
              <li>Focus on preparing for the next paper</li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Mental Techniques</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Practice deep breathing (4-4-4 method)</li>
              <li>
                Use positive self-talk such as:{' '}
                <span className="italic font-medium text-primary">“I am prepared and I will do my best.”</span>
              </li>
            </ul>

            <h3 className="text-2xl font-semibold mt-8 mb-4">Digital Discipline</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fix specific time for mobile use</li>
              <li>Avoid late-night scrolling on social media</li>
            </ul>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">One-Day-Before-Exam Strategy</h2>

            <p>The day before the exam should focus on calm revision rather than heavy study.</p>

            <p className="font-semibold text-gray-900 mt-4">What to do:</p>
            <ul className="list-disc pl-6 space-y-2 font-medium bg-gray-50 p-6 rounded-xl border border-gray-100 mb-8">
              <li>Revise only important points and formulas</li>
              <li>Avoid starting new topics</li>
              <li>Pack exam materials in advance</li>
              <li>Sleep early and stay calm</li>
            </ul>

            <div className="border border-secondary/30 bg-secondary/5 rounded-2xl p-8 text-center my-12">
              <h2 className="text-2xl font-bold text-secondary mb-6">Final Student Mantra</h2>
              <p className="text-xl text-gray-800 mb-4 font-medium">Exams are a phase, not the whole life.</p>
              <p className="text-xl text-gray-800 mb-4 font-medium">Consistency always beats last-minute pressure.</p>
              <p className="text-xl text-gray-800 font-medium">
                Health and peace of mind are just as important as marks.
              </p>
            </div>

            <hr className="my-10 border-gray-200" />

            <h2 className="text-3xl font-bold mt-10 mb-6 text-primary">Conclusion</h2>

            <p>
              <strong>How to utilise study leave during exams</strong> is not just about filling free time between
              papers. When used effectively, it becomes a powerful opportunity to revise smartly, strengthen weak areas,
              and build confidence.
            </p>

            <p>
              By balancing study, rest, health, and mental well-being, students can transform exam gaps into productive
              learning periods and perform their best in board exams.
            </p>

            <p>
              Students who follow a structured exam gap study plan often experience less stress and better results. Need
              extra help preparing? Our{' '}
              <Link href="/contact" className="font-medium">
                personalized online tuition
              </Link>{' '}
              classes can give you the structured guidance needed during study leave.
            </p>
          </article>

          {/* Quick CTA */}
          <div className="mt-16 bg-gradient-to-br from-primary to-[#0f365c] rounded-2xl p-8 md:p-12 text-center text-white shadow-xl">
            <h3 className="text-3xl font-bold mb-4">Make the Most of Your Study Gaps</h3>
            <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
              Need help clearing doubts right before your exams? Get instant support with our personalized one-to-one
              CBSE & ICSE sessions.
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
