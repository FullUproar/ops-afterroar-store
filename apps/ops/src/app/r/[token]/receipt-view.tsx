"use client";

import { useEffect, useState } from "react";

interface ReceiptItem {
  name: string;
  quantity: number;
  price_cents: number;
  total_cents: number;
}

interface ReceiptData {
  store_name: string;
  receipt_number: string;
  date_formatted: string;
  items: ReceiptItem[];
  subtotal_cents: number;
  tax_cents: number;
  discount_cents: number;
  credit_applied_cents: number;
  gift_card_applied_cents: number;
  loyalty_discount_cents: number;
  total_cents: number;
  payment_method: string;
  change_cents: number;
  customer_name: string | null;
  receipt_footer: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function paymentLabel(method: string): string {
  switch (method) {
    case "cash": return "Cash";
    case "card": return "Card";
    case "store_credit": return "Store Credit";
    case "gift_card": return "Gift Card";
    case "split": return "Split";
    default: return method;
  }
}

export function ReceiptView({ token }: { token: string }) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Capture form state
  const [showEmail, setShowEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<"email" | "phone" | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/r/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => { setReceipt(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [token]);

  async function handleCapture(type: "email" | "phone") {
    const value = type === "email" ? email.trim() : phone.trim();
    if (!value) return;
    setSending(true);
    setCaptureError(null);
    try {
      const res = await fetch(`/api/r/${token}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(type === "email" ? { email: value } : { phone: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCaptureError(data.error || "Something went wrong");
        return;
      }
      setSent(type);
      setShowEmail(false);
      setShowPhone(false);
    } catch {
      setCaptureError("Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#999", fontSize: 14 }}>Loading receipt...</div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ textAlign: "center", maxWidth: 320, margin: "0 auto" }}>
          <div style={{ fontSize: 56, color: "#ddd", marginBottom: 16 }}>{"\uD83E\uDDFE"}</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: "0 0 8px" }}>Receipt Not Found</h1>
          <p style={{ fontSize: 14, color: "#888", lineHeight: 1.5 }}>
            This receipt link may have expired or is no longer available.
            If you need a copy of your receipt, please contact the store.
          </p>
          <div style={{ marginTop: 24, fontSize: 12, color: "#bbb" }}>Powered by Afterroar</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "24px 16px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ marginBottom: 12 }}>
            <svg width="36" height="36" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block" }}>
              <circle cx="24" cy="24" r="20" stroke="#FF8200" strokeWidth="3" fill="none" />
              <circle cx="24" cy="24" r="12" stroke="#FF8200" strokeWidth="2" fill="none" />
              <circle cx="24" cy="24" r="4" fill="#FF8200" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: "0 0 4px" }}>{receipt.store_name}</h1>
          <div style={{ fontSize: 13, color: "#888" }}>{receipt.date_formatted}</div>
          <div style={{ fontSize: 12, color: "#aaa", fontFamily: "monospace", marginTop: 2 }}>Receipt {receipt.receipt_number}</div>
        </div>

        {/* Receipt card */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "20px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 20 }}>
          {receipt.customer_name && (
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Customer: {receipt.customer_name}</div>
          )}

          {/* Items */}
          <div style={{ borderBottom: "1px dashed #e5e7eb", paddingBottom: 12, marginBottom: 12 }}>
            {receipt.items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 14 }}>
                <span style={{ color: "#333", flex: 1, paddingRight: 8 }}>
                  {item.name}
                  {item.quantity > 1 && <span style={{ color: "#999" }}> x{item.quantity}</span>}
                </span>
                <span style={{ color: "#333", fontFamily: "monospace", whiteSpace: "nowrap" }}>{formatCents(item.total_cents)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#666" }}>
              <span>Subtotal</span>
              <span style={{ fontFamily: "monospace" }}>{formatCents(receipt.subtotal_cents)}</span>
            </div>

            {receipt.discount_cents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#b45309" }}>
                <span>Discount</span>
                <span style={{ fontFamily: "monospace" }}>-{formatCents(receipt.discount_cents)}</span>
              </div>
            )}

            {receipt.tax_cents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#666" }}>
                <span>Tax</span>
                <span style={{ fontFamily: "monospace" }}>{formatCents(receipt.tax_cents)}</span>
              </div>
            )}

            {receipt.loyalty_discount_cents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#7c3aed" }}>
                <span>Loyalty Discount</span>
                <span style={{ fontFamily: "monospace" }}>-{formatCents(receipt.loyalty_discount_cents)}</span>
              </div>
            )}

            {receipt.gift_card_applied_cents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#0d9488" }}>
                <span>Gift Card</span>
                <span style={{ fontFamily: "monospace" }}>-{formatCents(receipt.gift_card_applied_cents)}</span>
              </div>
            )}

            {receipt.credit_applied_cents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#b45309" }}>
                <span>Store Credit</span>
                <span style={{ fontFamily: "monospace" }}>-{formatCents(receipt.credit_applied_cents)}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#666" }}>
              <span>Payment</span>
              <span>{paymentLabel(receipt.payment_method)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 2px", borderTop: "1px solid #e5e7eb", marginTop: 8, fontWeight: 700, fontSize: 18, color: "#111" }}>
              <span>Total</span>
              <span style={{ fontFamily: "monospace" }}>{formatCents(receipt.total_cents)}</span>
            </div>

            {receipt.change_cents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#059669", fontWeight: 600 }}>
                <span>Change</span>
                <span style={{ fontFamily: "monospace" }}>{formatCents(receipt.change_cents)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Save this receipt */}
        {!sent && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ textAlign: "center", fontSize: 13, color: "#999", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
              <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              <span>Save this receipt</span>
              <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            </div>

            {captureError && (
              <div style={{ fontSize: 13, color: "#dc2626", textAlign: "center", marginBottom: 8 }}>{captureError}</div>
            )}

            {!showEmail && !showPhone && (
              <button
                onClick={() => setShowEmail(true)}
                style={{
                  width: "100%", padding: "14px 16px", background: "#fff", border: "1px solid #e5e7eb",
                  borderRadius: 12, fontSize: 15, color: "#333", cursor: "pointer", marginBottom: 8,
                  display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 18 }}>{"\uD83D\uDCE7"}</span> Email me a copy
              </button>
            )}

            {showEmail && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginBottom: 8 }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleCapture("email"); }}
                  autoFocus
                  style={{
                    width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8,
                    fontSize: 16, outline: "none", marginBottom: 8, boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { setShowEmail(false); setCaptureError(null); }}
                    style={{ flex: 1, padding: "10px", background: "#f3f4f6", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", color: "#666" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleCapture("email")}
                    disabled={sending || !email.trim()}
                    style={{
                      flex: 2, padding: "10px", background: "#FF8200", border: "none", borderRadius: 8,
                      fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer",
                      opacity: sending || !email.trim() ? 0.5 : 1,
                    }}
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            )}

            {!showEmail && !showPhone && (
              <button
                onClick={() => setShowPhone(true)}
                style={{
                  width: "100%", padding: "14px 16px", background: "#fff", border: "1px solid #e5e7eb",
                  borderRadius: 12, fontSize: 15, color: "#333", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 18 }}>{"\uD83D\uDCF1"}</span> Text me a copy
              </button>
            )}

            {showPhone && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                <input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleCapture("phone"); }}
                  autoFocus
                  style={{
                    width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8,
                    fontSize: 16, outline: "none", marginBottom: 8, boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { setShowPhone(false); setCaptureError(null); }}
                    style={{ flex: 1, padding: "10px", background: "#f3f4f6", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", color: "#666" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleCapture("phone")}
                    disabled={sending || !phone.trim()}
                    style={{
                      flex: 2, padding: "10px", background: "#FF8200", border: "none", borderRadius: 8,
                      fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer",
                      opacity: sending || !phone.trim() ? 0.5 : 1,
                    }}
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sent confirmation */}
        {sent && (
          <div style={{ textAlign: "center", padding: "16px 0", marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: "#059669", fontWeight: 600 }}>
              {sent === "email" ? "Receipt sent to your email!" : "Receipt will be texted to you!"}
            </div>
          </div>
        )}

        {/* Stay connected */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ textAlign: "center", fontSize: 13, color: "#999", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
            <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            <span>Stay connected</span>
            <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          </div>
          <a
            href="https://www.afterroar.com/signup"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block", width: "100%", padding: "14px 16px", background: "#7D55C7",
              borderRadius: 12, fontSize: 15, fontWeight: 600, color: "#fff", textAlign: "center",
              textDecoration: "none", boxSizing: "border-box",
            }}
          >
            Join Afterroar
          </a>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12, color: "#bbb" }}>
          <div>{receipt.receipt_footer}</div>
          <div style={{ marginTop: 4 }}>
            Afterroar Store Ops by{" "}
            <a href="https://www.fulluproar.com" target="_blank" rel="noopener noreferrer" style={{ color: "#FF8200", textDecoration: "none" }}>
              Full Uproar Games
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
