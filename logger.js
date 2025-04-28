const fs = require('fs');
const path = require('path');

// 设置文件路径
const filePath = path.join('I:', 'svntool', 'responsible_person.txt');

// 检查文件是否存在
if (!fs.existsSync(filePath)) {
    console.log(`文件 ${filePath} 不存在，跳过执行。`);
    process.exit(1); // 退出程序
}

// 读取文件内容
fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
        console.error(`读取文件失败：${err.message}`);
        process.exit(1); // 退出程序
    }

    // 初始化变量
    let responsiblePerson = null;

    // 按行解析文件内容
    const lines = data.split('\n');
    for (const line of lines) {
        // 查找包含 "responsible_person" 的行
        if (line.includes('responsible_person')) {
            // 提取冒号后的内容
            const parts = line.split(':');
            if (parts.length > 1) {
                responsiblePerson = parts.slice(1).join(':').trim(); // 去除前后空格
                break; // 找到后立即退出循环
            }
        }
    }

    // 输出验证
    console.log(`当前工作目录为: ${process.cwd()}`);
    if (responsiblePerson) {
        console.log(`demo1=${responsiblePerson}`);
        console.log(`::set-output name=responsible_person::${responsiblePerson}`);
    } else {
        console.log('未找到 responsible_person 的值。');
    }
});