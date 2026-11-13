"use client";

import type { Address, Hex } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { toast } from "sonner";
import { savingsCircleAbi, ZERO, type Summary } from "@/lib/contracts";
import { plannedRounds } from "@/lib/circle-logic";
import { useMusdPermit, useMusdSpend, useTx, type PermitSig } from "@/lib/hooks";
import { inviteSignerOf, rememberInviteKey, signInvite } from "@/lib/invite";
import { humanizeError } from "@/lib/errors";
import { chain } from "@/lib/wagmi";

/** Joins a circle: approves the deposit if needed and signs the private invite when required. */
export function useJoin(s: Summary | undefined, inviteKey: Hex | null) {
  const { address: user } = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const { send, busy } = useTx();
  const spend = useMusdSpend();
  const permit = useMusdPermit();

  const join = async (): Promise<boolean> => {
    if (!s || !user || !client) return false;
    try {
      const deposit = s.params.collateralAmount;
      if (deposit > 0n && !spend.hasBalance(deposit)) {
        toast.error("Your MUSD balance is too low for the deposit.");
        return false;
      }
      // deposit + every scheduled round, so later payments need no further approval
      let permitSig: PermitSig | null = null;
      if (deposit > 0n && spend.needsApproval(deposit)) {
        const commitment = deposit + s.params.contributionAmount * BigInt(plannedRounds(s));
        permitSig = await permit(commitment);
        if (!permitSig && !(await spend.approve(commitment))) return false;
      }
      let sig: Hex = "0x";
      const isPrivate = s.params.inviteSigner !== ZERO;
      if (isPrivate && user.toLowerCase() !== s.creator.toLowerCase()) {
        if (!inviteKey) {
          toast.error("This circle is invite only. Open the invite link you were sent.");
          return false;
        }
        if (inviteSignerOf(inviteKey).toLowerCase() !== s.params.inviteSigner.toLowerCase()) {
          toast.error("This invite link belongs to a different circle. Ask for a fresh link.");
          return false;
        }
        const digest = await client.readContract({
          address: s.circle as Address,
          abi: savingsCircleAbi,
          functionName: "inviteDigest",
          args: [user],
        });
        sig = await signInvite(inviteKey, digest);
      }
      const r = await send(
        "join",
        "Join circle",
        permitSig
          ? {
              address: s.circle,
              abi: savingsCircleAbi,
              functionName: "joinWithPermit",
              args: [sig, permitSig.value, permitSig.deadline, permitSig.v, permitSig.r, permitSig.s],
            }
          : { address: s.circle, abi: savingsCircleAbi, functionName: "join", args: [sig] },
        { success: `Welcome to ${s.meta.name}` },
      );
      if (r && inviteKey) rememberInviteKey(s.circle, inviteKey);
      return !!r;
    } catch (e) {
      toast.error(humanizeError(e));
      return false;
    }
  };

  return { join, joining: busy === "join" || spend.approving };
}
