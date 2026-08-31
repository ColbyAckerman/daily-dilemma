import './globals.css';
import { IBM_Plex_Sans } from 'next/font/google';

// used only for the masthead wordmark; the rest of the UI rides the
// system font stack (San Francisco / Segoe) for a native, tactile feel
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
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
