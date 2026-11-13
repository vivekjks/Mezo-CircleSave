"use client";

import type { Address, Hex } from "viem";
import { useSignMessage } from "wagmi";
import { QRCodeSVG } from "qrcode.react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { ZERO, type Summary } from "@/lib/contracts";
import { useCreatedBy, useOrigin } from "@/lib/hooks";
import { inviteKeyFromSignature, inviteKeyMessage, inviteSignerOf, inviteUrl, rememberInviteKey } from "@/lib/invite";
import { periodLabel, toMusd } from "@/lib/format";
import { humanizeError } from "@/lib/errors";
import { Button, Dialog, inputClass } from "@/components/ui";
import { CopyButton } from "@/components/identity";

export function InviteDialog({
  s,
  user,
  open,
  onClose,
  inviteKey,
  onKey,
}: {
  s: Summary;
  user?: Address;
  open: boolean;
  onClose: () => void;
  inviteKey: Hex | null;
  onKey: (k: Hex) => void;
}) {
  const isPrivate = s.params.inviteSigner !== ZERO;
  const isCreator = !!user && user.toLowerCase() === s.creator.toLowerCase();
  const created = useCreatedBy(isCreator ? user : undefined);
  const { signMessageAsync, isPending } = useSignMessage();
  const origin = useOrigin();

  const validKey = inviteKey && inviteSignerOf(inviteKey).toLowerCase() === s.params.inviteSigner.toLowerCase() ? inviteKey : null;
  const url = !isPrivate ? inviteUrl(origin, s.circle) : validKey ? inviteUrl(origin, s.circle, validKey) : null;
  const message = `Join my savings circle "${s.meta.name}" on CircleSave: ${toMusd(s.params.contributionAmount)} MUSD ${periodLabel(s.params.periodDuration)}, ${s.params.maxMembers} members.`;

  const regenerate = async () => {
    if (!user || !created.data) return;
    const nonce = created.data.findIndex((c) => c.toLowerCase() === s.circle.toLowerCase());
    if (nonce < 0) {
      toast.error("This wallet didn't create this circle.");
      return;
    }
    try {
      const sig = await signMessageAsync({ message: inviteKeyMessage(user, nonce) });
      const key = inviteKeyFromSignature(sig);
      if (inviteSignerOf(key).toLowerCase() !== s.params.inviteSigner.toLowerCase()) {
        toast.error("Your wallet produced a different key. Use the same wallet you created the circle with.");
        return;
      }
      rememberInviteKey(s.circle, key);
      onKey(key);
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Invite your group">
      {url ? (
        <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0 space-y-4">
            <p className="text-sm text-ink-soft">
              {isPrivate
                ? "This link carries a private key that lets people join. Share it only with your group."
                : "Anyone with this link can join while there's room."}
            </p>
            <div className="flex gap-2">
              <input readOnly value={url} className={`${inputClass} tabular truncate text-[13px]`} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <CopyButton value={url} label="Copy link" className="!text-ink" />
              <CopyButton value={`${message}\n${url}`} label="Copy message" />
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={() => navigator.share({ title: s.meta.name, text: message, url }).catch(() => {})}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink"
                >
                  <Share2 className="size-3.5" /> Share
                </button>
              )}
            </div>
            <p className="rounded-[10px] border border-rule px-3.5 py-3 text-[13px] text-ink-soft">{message}</p>
          </div>
          <div className="mx-auto rounded-[14px] border border-rule bg-white p-3">
            <QRCodeSVG value={url} size={148} fgColor="#000000" level="M" />
          </div>
        </div>
      ) : isCreator ? (
        <div>
          <p className="text-sm text-ink-soft">
            Private links come from a signature by the wallet that created the circle. Sign once to bring the link back on
            this device. It doesn&apos;t move funds or cost gas.
          </p>
          <Button variant="primary" className="mt-5" loading={isPending || created.isLoading} onClick={regenerate}>
            Create invite link
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          This circle is invite only. Only the person who started it can create new links. If someone sent you a link,
          you can pass that same link on.
        </p>
      )}
    </Dialog>
  );
}
