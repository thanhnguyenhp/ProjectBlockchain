// chain/scripts/deploy.js
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const name = "DocumentRegistry";

  // Đọc ABI để biết constructor cần gì
  const artifact = await hre.artifacts.readArtifact(name);
  const ctor = artifact.abi.find((x) => x.type === "constructor");
  const inputs = ctor ? (ctor.inputs || []) : [];

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Chuẩn bị args theo kiểu phổ biến
  let args = [];
  if (inputs.length === 0) {
    args = [];
  } else if (inputs.length === 1 && inputs[0].type === "address") {
    // constructor(address admin/owner/target)
    args = [deployer.address];
  } else {
    // Nếu constructor phức tạp hơn, bạn điền tay ở đây:
    // Ví dụ: constructor(address admin, string memory name)
    // args = [deployer.address, "MyRegistry"];
    throw new Error(
      `Constructor của ${name} có ${inputs.length} tham số (${inputs
        .map((i) => i.type)
        .join(", ")}). Hãy mở deploy.js và điền 'args' phù hợp.`
    );
  }

  // Deploy
  const contract = await hre.ethers.deployContract(name, args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`✅ ${name} deployed at:`, address);

  // Lưu deployments/latest.json (tham khảo)
  const depDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(depDir, { recursive: true });
  fs.writeFileSync(
    path.join(depDir, "latest.json"),
    JSON.stringify({ address }, null, 2),
    "utf8"
  );

  // Cập nhật client/src/config.js (chỉ thay dòng REGISTRY_ADDRESS)
  const clientCfg = path.resolve(__dirname, "..", "..", "client", "src", "config.js");
  if (!fs.existsSync(clientCfg)) {
    throw new Error(`Không tìm thấy ${clientCfg}. Kiểm tra lại đường dẫn trong dự án của bạn.`);
  }
  let src = fs.readFileSync(clientCfg, "utf8");
  const re = /export const REGISTRY_ADDRESS\s*=\s*"(0x[a-fA-F0-9]{40})";/;
  if (re.test(src)) {
    src = src.replace(re, `export const REGISTRY_ADDRESS="${address}";`);
  } else {
    src = `export const REGISTRY_ADDRESS="${address}";\n` + src;
  }
  fs.writeFileSync(clientCfg, src, "utf8");
  console.log("✏️  Updated REGISTRY_ADDRESS in client/src/config.js");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
