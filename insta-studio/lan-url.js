// このPCを社内で共有するときに、他の人へ伝えるURLを表示する。
// start-shared.bat から呼ばれる。単体でも `node lan-url.js` で使える。

const os = require("os");

const PORT = process.env.PORT || 3002;

/** 同じネットワークの人から見えるIPv4アドレスを集める */
function lanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      // 169.254.x.x は接続に失敗したときの自動割り当てなので除く
      if (net.address.startsWith("169.254.")) continue;
      found.push({ name, address: net.address });
    }
  }
  // 社内LANでよく使われる帯域を先に出す
  const priv = (a) =>
    /^192\.168\./.test(a) ? 0 : /^10\./.test(a) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3;
  return found.sort((a, b) => priv(a.address) - priv(b.address));
}

const addresses = lanAddresses();

/** 共有できるツール */
const TOOLS = [{ label: "Insta Studio ", path: "/" }];

function show(host) {
  for (const { label, path } of TOOLS) {
    console.log(`   ${label} http://${host}:${PORT}${path}`);
  }
}

console.log("");
console.log("============================================================");
if (addresses.length === 0) {
  console.log(" 社内ネットワークのアドレスが見つかりませんでした。");
  console.log(" 有線LANまたはWi-Fiに接続してから、開き直してください。");
} else {
  const [primary, ...others] = addresses;
  console.log(` 他の人には、このURLを伝えてください:  (${primary.name})`);
  console.log("");
  show(primary.address);
  console.log("");
  console.log(" パスワードを設定している場合は、");
  console.log(" ユーザー名とパスワードも一緒に伝えてください。");
  if (others.length > 0) {
    console.log("");
    console.log(" 上のアドレスで繋がらない場合は、こちらもお試しください:");
    for (const { name, address } of others) {
      console.log(`   http://${address}:${PORT}/   (${name})`);
    }
  }
}
console.log("");
console.log(" このPCでは:");
show("localhost");
console.log("");
console.log(" この画面を閉じるとアプリが止まり、全員が使えなくなります。");
console.log("============================================================");
console.log("");
