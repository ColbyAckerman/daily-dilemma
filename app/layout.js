import './globals.css';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

// used only for the masthead wordmark
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: 'Daily Dilemma',
  description:
    'A daily Iterated Prisoner’s Dilemma. Read a hidden opponent, choose to cooperate or betray each round, and place against the whole historical tournament field.',
};

export const viewport = {
  themeColor: '#0b0b0c',
  width: 'device-width',
  initialScale: 1,
};

const themeScript = `(function(){try{var t=localStorage.getItem('dd-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${mono.variable} ${sans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
