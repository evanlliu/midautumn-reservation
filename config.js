// GitHub Pages 连接配置。
// 注意：纯前端直连 GitHub 时，任何可自动解密的 Token 都只能算“混淆”，不能算 Secret。
window.APP_CONFIG = {
  github: {
    owner: "YOUR_GITHUB_USERNAME",
    repo: "YOUR_REPOSITORY_NAME",
    branch: "data",
    path: "data.json",

    // 使用 token-tool.html 生成。不要把 PAT 明文写在这里。
    tokenCiphertext: "PASTE_TOKEN_CIPHERTEXT_HERE",

    // 这是公开的混淆材料，不是 Secret。浏览器必须能够拿到它才能自动解密 Token。
    // 建议改成一段随机长字符串，然后用 token-tool.html 按相同字符串重新生成密文。
    keyMaterial: "CHANGE_THIS_PUBLIC_OBFUSCATION_MATERIAL"
  }
};
