import { useState } from "react";
import { CheckCircle2, XCircle, Target, ChevronDown, ChevronUp, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ClaimResult {
  claim: string;
  fulfilled: boolean;
  evidence: string;
  explanation: string;
}

interface VerificationResult {
  claims: ClaimResult[];
  fulfilledCount: number;
  totalClaims: number;
  summary: string;
}

interface ValuePromiseVerificationProps {
  content: string;
  claims: string[];
  valuePromise: string;
  onVerificationComplete?: (result: VerificationResult) => void;
  onContentUpdate?: (newContent: string) => void;
}

export const ValuePromiseVerification = ({
  content,
  claims,
  valuePromise,
  onVerificationComplete,
  onContentUpdate,
}: ValuePromiseVerificationProps) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [activeFixClaim, setActiveFixClaim] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const handleVerify = async () => {
    if (!content || claims.length === 0) {
      toast.error("Content and at least one claim are required");
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-value-promise", {
        body: { content, claims, valuePromise },
      });

      if (error) throw error;

      setResult(data);
      onVerificationComplete?.(data);

      if (data.fulfilledCount === data.totalClaims) {
        toast.success(`All ${data.totalClaims} claims fulfilled!`);
      } else {
        toast.warning(`${data.fulfilledCount}/${data.totalClaims} claims fulfilled`);
      }
    } catch (error) {
      console.error("Verification error:", error);
      const message = error instanceof Error ? error.message : "Failed to verify value promise";
      toast.error(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFixClaims = async (claimsToFix: ClaimResult[]) => {
    if (!result || !onContentUpdate || claimsToFix.length === 0) return;

    setIsFixing(true);
    setActiveFixClaim(claimsToFix.length === 1 ? claimsToFix[0].claim : null);

    try {
      const { data, error } = await supabase.functions.invoke("fix-failed-claims", {
        body: {
          content,
          failedClaims: claimsToFix.map((c) => ({
            claim: c.claim,
            explanation: c.explanation,
          })),
        },
      });

      if (error) throw error;
      if (!data?.content) throw new Error("No content returned");

      onContentUpdate(data.content);
      
      // Update the fixed claims in-place instead of clearing results
      const fixedClaimTexts = claimsToFix.map(c => c.claim);
      setResult(prev => {
        if (!prev) return prev;
        const updatedClaims = prev.claims.map(c => 
          fixedClaimTexts.includes(c.claim) 
            ? { ...c, fulfilled: true, evidence: "Fixed via AI repair", explanation: "This claim was repaired. Click 'Re-verify After Edits' to confirm." }
            : c
        );
        const fulfilledCount = updatedClaims.filter(c => c.fulfilled).length;
        return {
          ...prev,
          claims: updatedClaims,
          fulfilledCount,
          summary: fulfilledCount === prev.totalClaims 
            ? "All claims now addressed. Re-verify to confirm." 
            : `${fulfilledCount}/${prev.totalClaims} claims fulfilled. Fix remaining claims or re-verify.`,
        };
      });
      
      toast.success(
        claimsToFix.length === 1
          ? "Claim fix applied. Re-verify to confirm."
          : `Fixed ${claimsToFix.length} failed claim(s). Re-verify to confirm.`,
      );
    } catch (error) {
      console.error("Fix error:", error);
      const message = error instanceof Error ? error.message : "Failed to fix claims";
      toast.error(message);
    } finally {
      setIsFixing(false);
      setActiveFixClaim(null);
    }
  };

  if (claims.length === 0) return null;

  const score = result ? Math.round((result.fulfilledCount / result.totalClaims) * 100) : null;
  const failedClaims = result ? result.claims.filter((c) => !c.fulfilled) : [];
  const failedCount = failedClaims.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-t-lg">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Value Promise Verification</span>
          {result && (
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                result.fulfilledCount === result.totalClaims
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
              )}
            >
              {result.fulfilledCount}/{result.totalClaims} passed
            </span>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </CollapsibleTrigger>

      <CollapsibleContent className="p-4 pt-0 space-y-4">
        {!result && (
          <Button onClick={handleVerify} disabled={isVerifying || !content} className="w-full" variant="outline">
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking {claims.length} claims...
              </>
            ) : (
              <>
                <Target className="h-4 w-4 mr-2" />
                Verify {claims.length} Claims
              </>
            )}
          </Button>
        )}

        {result && (
          <div className="space-y-3">
            <div
              className={cn(
                "p-3 rounded-lg border",
                result.fulfilledCount === result.totalClaims
                  ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                  : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">
                  {result.fulfilledCount === result.totalClaims ? "All Claims Met" : "Some Claims Missing"}
                </span>
                <span
                  className={cn(
                    "text-xl font-bold",
                    score! >= 80
                      ? "text-green-600 dark:text-green-400"
                      : score! >= 60
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400",
                  )}
                >
                  {score}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{result.summary}</p>
            </div>

            {failedCount > 1 && onContentUpdate && (
              <Button
                onClick={() => handleFixClaims(failedClaims)}
                disabled={isFixing}
                className="w-full"
                variant="default"
              >
                {isFixing && !activeFixClaim ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Fixing {failedCount} failed claims...
                  </>
                ) : (
                  <>
                    <Wrench className="h-4 w-4 mr-2" />
                    Fix All {failedCount} Failed Claims
                  </>
                )}
              </Button>
            )}

            <div className="space-y-2">
              {result.claims.map((claimResult, index) => {
                const isActiveSingleFix = activeFixClaim === claimResult.claim;

                return (
                  <div
                    key={index}
                    className={cn(
                      "p-3 rounded-lg border",
                      claimResult.fulfilled
                        ? "bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800/50"
                        : "bg-red-50/50 border-red-200 dark:bg-red-900/10 dark:border-red-800/50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {claimResult.fulfilled ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      )}

                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="text-sm font-medium">{claimResult.claim}</p>
                        {claimResult.evidence && (
                          <blockquote className="text-xs italic border-l-2 pl-2 mt-1 opacity-75">
                            "{claimResult.evidence}"
                          </blockquote>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{claimResult.explanation}</p>

                        {!claimResult.fulfilled && onContentUpdate && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isFixing}
                            onClick={() => handleFixClaims([claimResult])}
                          >
                            {isFixing && isActiveSingleFix ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                Fixing this claim...
                              </>
                            ) : (
                              <>
                                <Wrench className="h-3.5 w-3.5 mr-2" />
                                Fix this claim
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={handleVerify}
              disabled={isVerifying || isFixing}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Re-checking...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Re-verify After Edits
                </>
              )}
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
