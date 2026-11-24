import fs from "node:fs";
import path from "node:path";

export function releaseConfig(env,identities,configDirectory) {
  const identity=env.OPROXY_SIGNING_IDENTITY;
  if(!identity?.startsWith("Developer ID Application:"))throw Error("正式分发需要 OPROXY_SIGNING_IDENTITY 指向 Developer ID Application 证书。");
  if(!identities.includes(`"${identity}"`))throw Error("本机钥匙串未找到指定的有效 Developer ID Application 签名身份。");
  const apple=!!(env.APPLE_ID||env.APPLE_APP_SPECIFIC_PASSWORD),api=!!(env.APPLE_API_KEY||env.APPLE_API_KEY_ID||env.APPLE_API_ISSUER);
  if(apple&&!(env.APPLE_ID&&env.APPLE_APP_SPECIFIC_PASSWORD&&env.APPLE_TEAM_ID))throw Error("Apple ID 公证凭据不完整。");
  if(!apple&&api&&!(env.APPLE_API_KEY&&env.APPLE_API_KEY_ID&&env.APPLE_API_ISSUER))throw Error("App Store Connect 公证凭据不完整。");
  if(!apple&&!api&&!env.APPLE_KEYCHAIN_PROFILE)throw Error("需要配置完整 Apple 公证凭据或 APPLE_KEYCHAIN_PROFILE。");
  if(!apple&&api&&!fs.existsSync(env.APPLE_API_KEY))throw Error("公证 API 私钥文件不存在。");
  const entitlements=path.join(configDirectory,"entitlements.mac.plist");
  if(!fs.existsSync(entitlements))throw Error("缺少正式构建的 entitlements 文件。");
  const base=JSON.parse(fs.readFileSync(path.join(configDirectory,"../package.json"),"utf8")).build;
  return {...base,forceCodeSigning:true,directories:{...base.directories,output:"dist/release"},mac:{...base.mac,identity,hardenedRuntime:true,notarize:true,entitlements,entitlementsInherit:entitlements}};
}
