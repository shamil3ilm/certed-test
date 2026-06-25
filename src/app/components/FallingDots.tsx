'use client';

import { useEffect, useState } from 'react';

const FallingDots = () => {
    const [dots, setDots] = useState<{ id: number; left: string; delay: string; size: string }[]>([]);

    useEffect(() => {
        // Generate random dots only on the client to avoid hydration mismatch
        const newDots = Array.from({ length: 15 }).map((_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            delay: `${Math.random() * 1.5}s`, // Random delay up to 1.5s
            size: `${Math.random() * 6 + 4}px`, // Random size between 4px and 10px
        }));
        setDots(newDots);
    }, []);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {dots.map((dot) => (
                <div
                    key={dot.id}
                    className="absolute top-[-20px] bg-blue-400 rounded-full opacity-0 animate-fall"
                    style={{
                        left: dot.left,
                        width: dot.size,
                        height: dot.size,
                        animationDelay: dot.delay,
                        animationDuration: '2s',
                        animationFillMode: 'forwards',
                    }}
                />
            ))}
            <style jsx>{`
        @keyframes fall {
          0% {
            transform: translateY(0);
            opacity: 0.6;
          }
          100% {
            transform: translateY(100vh); /* Fall full screen height roughly */
            opacity: 0;
          }
        }
        .animate-fall {
            animation-name: fall;
            animation-timing-function: ease-in;
        }
      `}</style>
        </div>
    );
};

export default FallingDots;
