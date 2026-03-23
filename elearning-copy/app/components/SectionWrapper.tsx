import { ReactNode } from 'react';

interface SectionWrapperProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

const SectionWrapper = ({ children, className = '', id = '' }: SectionWrapperProps) => {
  return (
    <section id={id} className={`w-full py-12 md:py-20 px-4 md:px-8 max-w-7xl mx-auto ${className}`}>
      {children}
    </section>
  );
};

export default SectionWrapper;
