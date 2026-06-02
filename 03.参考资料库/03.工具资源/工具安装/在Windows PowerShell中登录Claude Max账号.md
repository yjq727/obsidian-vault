# 在 Windows PowerShell 中登录 Claude Max 账号

> 适用场景：购买了 Claude Max 后，Claudian 插件无法使用，需要在 Claude Code 里单独登录账号。
> **适用系统**：Windows，使用 PowerShell 操作。

---

## 步骤

**第一步：打开 PowerShell**

按键盘上的 `Win + R`（Win 就是键盘左下角那个 Windows 图标键），弹出一个小窗口，输入：

```
powershell
```

然后点「确定」，会打开一个蓝色/黑色的窗口，这就是 PowerShell。

---

**第二步：输入登录命令**

在 PowerShell 窗口里，直接打这行字，然后按回车：

```
claude login
```

---

**第三步：选择登录方式**

屏幕上会出现几个选项，用**键盘上下箭头**选到这一项：

```
Claude.ai account (Max/Pro)
```

选中后按**回车**。

---

**第四步：浏览器里授权**

这时候会自动弹出浏览器页面。

⚠️ **重要**：确认浏览器里登录的是你**买了 Claude Max 的那个账号**。

如果不是，先在浏览器里退出当前账号，换成你买 Max 的账号登录，然后再点页面上的**授权/Authorize** 按钮。

---

**第五步：回到 PowerShell 确认**

授权成功后，回到 PowerShell 窗口，你会看到类似这样的提示：

```
Logged in as 你的邮箱@xxx.com
```

看到这个就说明**登录成功了**。

---

**第六步：测试 Claudian 插件**

现在回到 Obsidian，打开 Claudian 聊天窗口，随便发一句话（比如"你好"），如果能正常回复，就说明全部搞定了 ✅

---

## 常见问题

| 情况 | 怎么办 |
|------|--------|
| 输入 `claude login` 后提示"找不到命令" | Claude Code 没装好，需要先运行 `npm install -g @anthropic-ai/claude-code` |
| 浏览器没有自动弹出来 | PowerShell 里会显示一个网址，手动复制到浏览器打开 |
| 授权后 Claudian 还是用不了 | 关掉 Obsidian 重新打开，再试一次 |
| 其他看不懂的报错 | 截图发给老师就行 |

---

## 注意事项

- Claude Code 和 Claude.ai 网页版是**两个独立的登录系统**，买了 Max 必须在 Claude Code 里单独登录一次
- 登录成功后不需要重复操作，重启电脑也不会掉登录状态
