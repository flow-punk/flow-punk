import gradient from 'gradient-string';

/**
 * The FLOW PUNK ASCII logo. Punk-rock block letters with a magenta→cyan
 * gradient. Static — no animation, prints once at the top of `init`.
 */
const LOGO = String.raw`
███████╗██╗      ██████╗ ██╗    ██╗    ██████╗ ██╗   ██╗███╗   ██╗██╗  ██╗
██╔════╝██║     ██╔═══██╗██║    ██║    ██╔══██╗██║   ██║████╗  ██║██║ ██╔╝
█████╗  ██║     ██║   ██║██║ █╗ ██║    ██████╔╝██║   ██║██╔██╗ ██║█████╔╝
██╔══╝  ██║     ██║   ██║██║███╗██║    ██╔═══╝ ██║   ██║██║╚██╗██║██╔═██╗
██║     ███████╗╚██████╔╝╚███╔███╔╝    ██║     ╚██████╔╝██║ ╚████║██║  ██╗
╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝     ╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝
`;

const TAGLINE = 'self-hosted CRM that runs on your edge';

export function renderLogo(): string {
  const punkGradient = gradient(['#ff00aa', '#aa00ff', '#00d4ff']);
  return punkGradient.multiline(LOGO) + '\n     ' + TAGLINE + '\n';
}
