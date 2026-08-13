import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function currentUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  return db.user.findUnique({ where: { email } });
}

export async function ownedWorkspace(workspaceId: string) {
  const user = await currentUser();
  if (!user) return null;
  return db.workspace.findFirst({
    where: { id: workspaceId, userId: user.id },
  });
}
