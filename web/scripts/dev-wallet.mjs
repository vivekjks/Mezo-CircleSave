// Local dev wallet for end-to-end UI testing against the real Mezo Testnet.
// It answers an injected EIP-1193 provider in the browser and signs with a TEST key.
// Usage (from web/):  DEV_WALLET_KEY=0x… PORT=8645 node scripts/dev-wallet.mjs
// Never use a key that holds real funds.
import http from "node:http";
import { createPublicClient, createWalletClient, http as httpTransport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mezoTestnet } from "viem/chains";

const RPC = "https://rpc.test.mezo.org";
const account = privateKeyToAccount(process.env.DEV_WALLET_KEY);
const port = Number(process.env.PORT || 8645);
const pub = createPublicClient({ chain: mezoTestnet, transport: httpTransport(RPC) });
const wallet = createWalletClient({ account, chain: mezoTestnet, transport: httpTransport(RPC) });

const big = (v) => (v === undefined || v === null ? undefined : BigInt(v));

/** JSON typed data arrives with numbers as strings; viem wants bigint for (u)int fields. */
function normalise(types, primaryType, message) {
  const out = { ...message };
  for (const f of types[primaryType] ?? []) {
    if (/^u?int\d*$/.test(f.type) && out[f.name] !== undefined) out[f.name] = BigInt(out[f.name]);
  }
  return out;
}

async function handle(method, params = []) {
  switch (method) {
    case "eth_accounts":
    case "eth_requestAccounts":
      return [account.address];
    case "eth_chainId":
      return "0x7b7b";
    case "net_version":
      return "31611";
    case "eth_sendTransaction": {
      const tx = params[0];
      const hash = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: big(tx.value) ?? 0n,
        gas: big(tx.gas),
      });
      console.log(`sent ${hash} → ${tx.to}`);
      return hash;
    }
    case "eth_signTypedData_v4": {
      const typed = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      const { EIP712Domain, ...types } = typed.types;
      void EIP712Domain;
      return account.signTypedData({
        domain: typed.domain,
        types,
        primaryType: typed.primaryType,
        message: normalise(types, typed.primaryType, typed.message),
      });
    }
    case "personal_sign":
      return account.signMessage({ message: { raw: params[0] } });
    default:
      if (method.startsWith("wallet_")) return null;
      return pub.request({ method, params });
  }
}

http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    let body = "";
    for await (const chunk of req) body += chunk;
    let id = null;
    try {
      const msg = JSON.parse(body);
      id = msg.id;
      const result = await handle(msg.method, msg.params);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (e) {
      const message = e?.shortMessage || e?.message || String(e);
      console.log(`error: ${message}`);
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: e?.code ?? -32000, message, data: e?.data } }));
    }
  })
  .listen(port, () => console.log(`dev wallet ${account.address} on http://127.0.0.1:${port}`));
