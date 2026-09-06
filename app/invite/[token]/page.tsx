import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { joinProjectByInviteToken } from "@/lib/projects/mutations";

function InvalidInvite() {
  return (
    <main className="container container--narrow">
      <div className="auth">
        <h1 className="auth__title">Invite link not found</h1>
        <p className="auth__alt">This invite link is invalid or has been revoked.</p>
        <p className="auth__alt">
          <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const project = await prisma.project.findUnique({ where: { inviteToken: token } });
  if (!project) return <InvalidInvite />;

  const user = await getSessionUser();
  if (!user) redirect(`/signup?invite=${token}`);

  const result = await joinProjectByInviteToken(user.id, token);
  if (!result.ok) return <InvalidInvite />;

  redirect(`/projects/${result.slug}`);
}
