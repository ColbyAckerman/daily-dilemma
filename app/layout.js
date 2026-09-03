import './globals.css';
import { Outfit } from 'next/font/google';

// used only for the masthead wordmark + the DD#N mark — a geometric,
// constructed sans that matches the drawn "D" of the favicon, so the
// brand reads as one shape. The rest of the UI rides the system stack.
const sans = Outfit({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: 'Daily Dilemma',
  description:
    'A daily Iterated Prisoner’s Dilemma. Read a hidden opponent, choose to cooperate or defect each round, and place against the whole historical tournament field.',
  // added to home screen, it launches chromeless like a native app
  appleWebApp: {
    capable: true,
    title: 'Daily Dilemma',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport = {
  themeColor: '#0b0b0c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

const themeScript = `(function(){try{var t=localStorage.getItem('dd-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={sans.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
