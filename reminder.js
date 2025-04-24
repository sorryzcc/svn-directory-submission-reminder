const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); // 使用 promise 版本
const os = require('os'); // 用于获取网络接口信息
const logger = require('./logger.js')

const app = express();
const PORT = process.argv[2] || 8080;

// 创建数据库连接池配置 - 使用 promise 版本
const pool = mysql.createPool({
  host: '9.134.107.151',
  user: 'root',
  password: 'xuMwn*6829pBfx',
  port: '3306',
  database: 'svn_tool',
  waitForConnections: true,
  connectionLimit: 10, // 根据实际情况调整
  queueLimit: 0,
});

app.use(bodyParser.json());



// 处理 Web 钩子请求的函数
async function handleWebhookRequest(reqBody) {
    const { user_name, paths } = reqBody;
  
    const conn = await pool.getConnection();
    try {
      // 查询 SVN_directory_submission_reminder 表，获取所有目录信息
      const [branchRows] = await conn.execute('SELECT * FROM SVN_directory_submission_reminder');
      logger.info(`从数据库中查询到的目录信息：${JSON.stringify(branchRows)}`);
  
      let hasMatchingBranch = false; // 标记是否有匹配的目录
      let responseMessages = []; // 存储所有目录的响应消息
  
      for (const branch of branchRows) {
        const {
          directory_name,
          responsible_person
        } = branch;
  
        // 检查当前目录是否在请求的 paths 中
        const isBranchIncluded = paths.some(path => path.includes(directory_name) || path.includes(responsible_person));
        if (!isBranchIncluded) {
          logger.info(`目录 "${directory_name}" (${responsible_person}) 不在请求的 paths 中，跳过检查`);
          continue; // 如果当前目录不在请求的 paths 中，跳过
        }
  
        hasMatchingBranch = true; // 标记有匹配的目录
        logger.info(`正在检查目录 "${directory_name}" (${responsible_person}) 的锁定状态`);
  
        return { status: 500, message: `提交被拒绝：目录 "${directory_name}" (${responsible_person}) 已锁定，且用户 "${user_name}" 不在白名单中。` };
      }
  
      // 如果没有任何匹配的目录，直接允许提交
      if (!hasMatchingBranch) {
        logger.info("没有匹配的目录，允许提交");
        return { status: 200, message: "No matching branches found, allowing commit." };
      }
  
      // 返回所有目录的响应消息
      logger.info(`所有目录的响应消息：${responseMessages}`);
      return { status: 200, messages: responseMessages };
    } catch (error) {
      logger.error(`处理 Web 钩子请求时发生错误：${error.message}`);
      return { status: 500, message: error.message };
    } finally {
      conn.release();
    }
  }

// POST 路由处理函数
app.post('/', async (req, res) => {
    try {
        const body = req.body;
        logger.info(`Received Request Body: ${JSON.stringify(body)}`);

        // 判断是机器人请求还是 Web 钩子请求
        if (body.from && body.webhook_url) {
            // 处理机器人请求
            let textContent = body.text?.content || '';
            logger.info(`Text Content Received: ${textContent}`);

            // 去掉指令前的“@svn机器人”部分
            textContent = textContent.replace(/^@svn机器人\s*/, '').trim();
            logger.info(`Processed Text Content: ${textContent}`);

            const userresponsible_person = body.from.responsible_person; // 请求者的 responsible_person

            // 匹配“锁库 目录名”指令
            const lockPattern = /^lock\s+(\S+)/;
            const lockMatch = textContent.match(lockPattern);

            // 匹配“开闸 目录名”指令
            const unlockAllPattern = /^unlockall\s+(\S+)/;
            const unlockAllMatch = textContent.match(unlockAllPattern);

            // 匹配“增加一次性白名单 目录名 用户名”指令
            const disposableWhitelistPattern = /^unlock\s+(\S+)\s+(.*)$/;
            const disposableWhitelistMatch = textContent.match(disposableWhitelistPattern);
            logger.info(`Lock Match: ${JSON.stringify(lockMatch)}, UnlockAll Match: ${JSON.stringify(unlockAllMatch)}, DisposableWhitelist Match: ${JSON.stringify(disposableWhitelistMatch)}`);

            // 提取目录标识符
            let branchIdentifier = null;

            if (lockMatch) {
                branchIdentifier = lockMatch[1].trim();
            } else if (unlockAllMatch) {
                branchIdentifier = unlockAllMatch[1].trim();
            } else if (disposableWhitelistMatch) {
                branchIdentifier = disposableWhitelistMatch[1].trim();
            }

            // 如果没有匹配到任何指令，返回默认消息
            if (!branchIdentifier) {
                return res.status(200).json({
                    msgtype: 'text',
                    text: {
                        content: `未识别的指令，请重新输入。\n示例：\n lock b01rel\n unlockall b01rel\n unlock b01rel @v_zccgzhang(张匆匆)`
                    }
                });
            }

            const [permissionResults] = await pool.execute(checkPermissionQuery, [branchIdentifier]);

            if (permissionResults.length === 0) {
                logger.info(`目录 ${branchIdentifier} 不存在`);
                return res.status(200).json({
                    msgtype: 'text',
                    text: {
                        content: `目录 ${branchIdentifier} 不存在，请检查目录名称是否正确。`
                    }
                });
            }

            const whitelist = permissionResults[0].svn_lock_whitelist;
            logger.info(`Raw Whitelist Content for Branch ${branchIdentifier}: ${whitelist}`);

            // 将白名单分割为数组并去除多余空格
            const whitelistArray = whitelist.split(',').map(item => item.trim());
            logger.info(`Parsed Whitelist Array for Branch ${branchIdentifier}: ${JSON.stringify(whitelistArray)}`);

            // 检查用户是否在白名单中
            if (!whitelistArray.includes(userresponsible_person)) {
                logger.info(`请求者 ${userresponsible_person} 不在目录 ${branchIdentifier} 的永久白名单中，无权操作`);
                return res.status(200).json({
                    msgtype: 'text',
                    text: {
                        content: `${userresponsible_person} 不在目录 ${branchIdentifier} 的永久白名单内，无权执行此操作。`
                    }
                });
            }

            // 根据指令类型执行对应逻辑
            if (lockMatch) {
                // 处理目录锁定逻辑
                const success = await updateBranchLockStatus(branchIdentifier, 1);
                const replyMessage = success
                    ? `已成功锁定目录 ${branchIdentifier}`
                    : `锁定目录 ${branchIdentifier} 失败，请检查目录是否存在`;
                return res.status(200).json({ msgtype: 'text', text: { content: replyMessage } });
            } else if (unlockAllMatch) {
                // 处理目录解锁逻辑
                const success = await updateBranchLockStatus(branchIdentifier, 0);
                const replyMessage = success
                    ? `已成功解锁目录 ${branchIdentifier}`
                    : `解锁目录 ${branchIdentifier} 失败，请检查目录是否存在`;
                return res.status(200).json({ msgtype: 'text', text: { content: replyMessage } });
            } else if (disposableWhitelistMatch) {
                const usersPart = disposableWhitelistMatch[2].trim(); // 获取用户标识部分

                // 提取用户标识
                const words = usersPart.split(/\s+/); // 按空格分割
                const matches = words
                    .filter(word => word.startsWith('@') && word.includes('(') && word.includes(')')) // 筛选符合条件的单词
                    .map(word => word.slice(1).split('(')[0].trim()); // 提取用户名部分
                logger.info(`提取的所有用户标识: ${JSON.stringify(matches)}`);

                // 调用增加一次性白名单逻辑
                const success = await addDisposableWhitelist(branchIdentifier, matches.join(','));

                // 构造回复消息
                const addedUsers = matches.join(', '); // 将用户标识用逗号分隔
                const replyMessage = success
                    ? `已成功为目录 ${branchIdentifier} 增加一次性白名单用户：${addedUsers}`
                    : `为目录 ${branchIdentifier} 增加一次性白名单用户失败，请检查目录或用户信息`;

                return res.status(200).json({ msgtype: 'text', text: { content: replyMessage } });
            }
        } else if (body.user_name && body.operation_kind && body.event_type) {
            // 处理 Web 钩子请求
            const result = await handleWebhookRequest(body);
            return res.status(result.status).json(result);
        } else {
            // 未知请求类型
            return res.status(200).json({ status: 200, message: "Unknown request type." });
        }
    } catch (error) {
        logger.error(error.message);
        return res.status(500).json({ status: 500, message: error.message });
    }
});

// 获取本机的 IPv4 地址
function getLocalIPv4Address() {
  const interfaces = os.networkInterfaces(); // 获取所有网络接口
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    for (const responsible_person of iface) {
      if (responsible_person.family === 'IPv4' && !responsible_person.internal) {
        return responsible_person.address;
      }
    }
  }
  return '127.0.0.1'; // 如果没有找到合适的 IPv4 地址，则返回 localhost
}

// 启动服务器
const server = app.listen(PORT, () => {
  const ip = getLocalIPv4Address(); // 获取本地 IPv4 地址
  const port = server.address().port;

  logger.info(`服务器已启动，监听地址：http://${ip}:${port}`);
});

// 简单处理程序终止信号以优雅地关闭服务器
process.on('SIGINT', async () => {
  logger.info("Shutting down server...");
  await pool.end(); // 异步关闭数据库连接池
  process.exit();
});