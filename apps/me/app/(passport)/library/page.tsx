import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { LibraryEditor } from './library-editor';

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { gameLibrary: true },
  });

  let library: Array<{ title: string; slug?: string; own: boolean; bring: boolean; love: boolean; nope: boolean }> = [];
  if (user?.gameLibrary) {
    try {
      const parsed = JSON.parse(user.gameLibrary);
      if (Array.isArray(parsed)) {
        library = parsed.map((g: Record<string, unknown>) => ({
          title: (g.title || g.name || '') as string,
          slug: g.slug as string | undefined,
          own: (g.own ?? true) as boolean,
          bring: (g.bring ?? g.willingToBring ?? false) as boolean,
          love: (g.love ?? false) as boolean,
          nope: (g.nope ?? false) as boolean,
        }));
      }
    } catch {
      library = [];
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#FF8200', marginBottom: '0.5rem' }}>
        Game Library
      </h1>
      <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
        Games you own, love, or are willing to bring to game night.
        Apps you connect to your Passport can use this for smart game suggestions.
      </p>

      <LibraryEditor initialGames={library} />
    </div>
  );
}
