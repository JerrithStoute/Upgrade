import NextLink from "next/link";

/**
 * The program's link. Same as Next's, except it doesn't load pages in the background before
 * they're clicked ("prefetch"): every page here is built fresh for the signed-in company, so
 * each background load is a full page build — dozens per screen, and the page you actually
 * clicked waited behind them. A click still loads its page right away. Use this, not next/link.
 */
export default function Link({ prefetch = false, ...props }: React.ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
