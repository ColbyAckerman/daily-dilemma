import './globals.css';
import { Archivo_Black } from 'next/font/google';

// used only for the masthead wordmark + the DD#N mark — a heavy,
// blocky geometric display face that reads as constructed / drawn,
// matching the favicon "D". The rest of the UI rides the system stack.
const sans = Archivo_Black({
  subsets: ['latin'],
  weight: ['400'],
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
