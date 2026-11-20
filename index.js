const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const settings = require('./settings');

const DATA_FILES = {
    groups: './groupSettings.json',
    warns: './linkWarns.json',
    access: './accessControl.json',
    reports: './reports.json'
};

function loadJson(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
            return fallback;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let groupSettings = loadJson(DATA_FILES.groups, {});
let linkWarns = loadJson(DATA_FILES.warns, {});
let accessControl = loadJson(DATA_FILES.access, { privateMode: false, allowedUsers: [] });
let reportsData = loadJson(DATA_FILES.reports, { totalReports: 0, logs: [] });

let globalRoastEnabled = true;

function cardBox(title, lines) {
    const body = lines.join('\n');
    return `╭───「 *${title}* 」───╮\n${body}\n╰──────────────╯\n_بواسطة: ${settings.ownerSignature}_`;
}

function normalizePhone(raw) {
    if (!raw) return '';
    let cleaned = String(raw).replace(/\D/g, '');
    if (cleaned.startsWith('01') && cleaned.length === 11) {
        cleaned = '2' + cleaned;
    }
    return cleaned;
}

function extractLabel(pushname) {
    if (!pushname || !String(pushname).trim()) return 'مستخدم';
    return String(pushname).trim().split(/\s+/)[0];
}

async function reactTo(msg, emoji) {
    try {
        await msg.react(emoji);
    } catch {}
}

function hasLink(text) {
    return /(https?:\/\/|www\.|chat\.whatsapp\.com\/|t\.me\/|discord\.gg\/)/i.test(text || '');
}

const phoneNumber = normalizePhone(process.env.PHONE_NUMBER || settings.defaultPhoneNumber);

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'wa-pair-session' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('code', (code) => {
    console.log(`PAIRING CODE (${phoneNumber}): ${code}`);
});

client.on('ready', async () => {
    console.log('BOT IS READY!');
    try {
        if (phoneNumber && !client.info?.wid) {
            const pairingCode = await client.requestPairingCode(phoneNumber);
            console.log(`PAIRING CODE (${phoneNumber}): ${pairingCode}`);
        }
    } catch (err) {
        console.error('Pairing code error:', err?.message || err);
    }
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED SUCCESSFULLY');
});

client.on('auth_failure', (msg) => {
    console.error('AUTH FAILURE:', msg);
});

client.on('disconnected', (reason) => {
    console.log('DISCONNECTED:', reason);
});

client.on('message', async (msg) => {
    try {
        const body = (msg.body || '').trim();
        const bodyLower = body.toLowerCase();
        const chat = await msg.getChat();
        const senderId = msg.author || msg.from;
        const senderContact = await msg.getContact().catch(() => null);
        const userLabel = extractLabel(senderContact?.pushname || '');

        if (accessControl.privateMode) {
            const isAllowed = senderId === client.info?.wid?._serialized || accessControl.allowedUsers.includes(senderId);
            if (!isAllowed) {
                return;
            }
        }

        let groupConf = null;
        if (chat.isGroup) {
            if (!groupSettings[chat.id._serialized]) {
                groupSettings[chat.id._serialized] = {
                    antiLink: true,
                    roastBack: true
                };
                saveJson(DATA_FILES.groups, groupSettings);
            }
            groupConf = groupSettings[chat.id._serialized];
        }

        let senderIsAdmin = false;
        let botIsAdmin = false;
        if (chat.isGroup) {
            const botId = client.info?.wid?._serialized;
            const participant = chat.participants.find((p) => p.id._serialized === senderId);
            const botParticipant = chat.participants.find((p) => p.id._serialized === botId);
            senderIsAdmin = Boolean(participant && (participant.isAdmin || participant.isSuperAdmin));
            botIsAdmin = Boolean(botParticipant && (botParticipant.isAdmin || botParticipant.isSuperAdmin));
        }

        if (chat.isGroup && groupConf?.antiLink && hasLink(body) && !senderIsAdmin && !body.startsWith('.')) {
            const key = `${chat.id._serialized}_${senderId}`;
            linkWarns[key] = (linkWarns[key] || 0) + 1;
            saveJson(DATA_FILES.warns, linkWarns);

            await msg.delete(true).catch(() => {});
            await reactTo(msg, settings.reactions.error);

            if (linkWarns[key] >= 3) {
                if (botIsAdmin) {
                    await chat.removeParticipants([senderId]).catch(() => {});
                    delete linkWarns[key];
                    saveJson(DATA_FILES.warns, linkWarns);
                    await chat.sendMessage(
                        cardBox('طرد مخالف الروابط 🚫', [
                            `العضو: *${userLabel}*`,
                            'السبب: تجاوز الحد المسموح للروابط (3 تحذيرات).'
                        ])
                    );
                }
            } else {
                await chat.sendMessage(
                    cardBox('تحذير روابط ⚠️', [
                        `العضو: *${userLabel}*`,
                        `تحذير رقم: *${linkWarns[key]} من 3*`,
                        'يُمنع إرسال الروابط داخل المجموعة.'
                    ])
                );
            }
            return;
        }

        let targetId = null;
        if (msg.mentionedIds && msg.mentionedIds.length > 0) {
            targetId = msg.mentionedIds[0];
        } else if (msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage().catch(() => null);
            if (quoted) {
                targetId = quoted.author || quoted.from;
            }
        }

        if (body.startsWith('.')) {
            if (body === '.حمص') {
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('حمص 🫘', ['حمص الشام جاهز ومظبوط يا معلم!']));
                return;
            }

            if (body === '.بوت') {
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('حالة البوت 🤖', ['البوت شغال ومستعد لأوامرك.']));
                return;
            }

            if (body === '.كسمك') {
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('رد مباشر ⚡', ['تم استلام الأمر بنجاح.']));
                return;
            }

            if (body === '.اغلط') {
                globalRoastEnabled = true;
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('وضع المناكفة 🔥', ['تم تفعيل الرد التلقائي على الكلمات المستهدفة.']));
                return;
            }

            if (body === '.اسكت2') {
                globalRoastEnabled = false;
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('وضع الصمت 🤫', ['تم إيقاف الرد التلقائي بنجاح.']));
                return;
            }

            if (body === '.خاص') {
                accessControl.privateMode = true;
                saveJson(DATA_FILES.access, accessControl);
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('الوضع الخاص 🔒', ['تم تفعيل وضع الخاص.']));
                return;
            }

            if (body === '.عام') {
                accessControl.privateMode = false;
                saveJson(DATA_FILES.access, accessControl);
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('الوضع العام 🌐', ['تم فتح الاستخدام العام للبوت.']));
                return;
            }

            if (body.startsWith('.استخدام')) {
                if (!targetId) {
                    await reactTo(msg, settings.reactions.error);
                    await msg.reply('❌ اعمل منشن أو رد على رسالة الشخص مع *.استخدام*.');
                    return;
                }
                if (!accessControl.allowedUsers.includes(targetId)) {
                    accessControl.allowedUsers.push(targetId);
                    saveJson(DATA_FILES.access, accessControl);
                }
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('منح صلاحية ✅', ['تم السماح للعضو باستخدام البوت.']));
                return;
            }

            if (body.startsWith('.الغاء')) {
                if (!targetId) {
                    await reactTo(msg, settings.reactions.error);
                    await msg.reply('❌ اعمل منشن أو رد على رسالة الشخص مع *.الغاء*.');
                    return;
                }
                accessControl.allowedUsers = accessControl.allowedUsers.filter((id) => id !== targetId);
                saveJson(DATA_FILES.access, accessControl);
                await reactTo(msg, settings.reactions.success);
                await msg.reply(cardBox('إلغاء صلاحية 🗑️', ['تم سحب صلاحية الاستخدام من العضو.']));
                return;
            }

            if (body.startsWith('.اظهار')) {
                const inspectId = targetId || senderId;
                const contact = await client.getContactById(inspectId).catch(() => null);
                await reactTo(msg, settings.reactions.success);
                await msg.reply(
                    cardBox('بيانات جهة الاتصال 📇', [
                        `الاسم: *${contact?.pushname || contact?.name || 'غير متوفر'}*`,
                        `الرقم: *${contact?.number || inspectId.split('@')[0]}*`,
                        `المعرف: *${inspectId}*`
                    ])
                );
                return;
            }

            if (body.startsWith('.ابلاغ')) {
                const reportedTarget = targetId || senderId;
                reportsData.totalReports += 100;
                reportsData.logs.push({
                    target: reportedTarget,
                    added: 100,
                    at: new Date().toISOString()
                });
                saveJson(DATA_FILES.reports, reportsData);
                await reactTo(msg, settings.reactions.success);
                await msg.reply(
                    cardBox('سجل البلاغات 📋', [
                        `الهدف: *${reportedTarget.split('@')[0]}*`,
                        'تم تسجيل: *100 بلاغ* (محاكاة سجل محلي)',
                        `إجمالي المسجل: *${reportsData.totalReports}*`
                    ])
                );
                return;
            }

            if (body.startsWith('.طرد')) {
                if (!senderIsAdmin) {
                    await reactTo(msg, settings.reactions.error);
                    await msg.reply('❌ الأمر ده للأدمن فقط.');
                    return;
                }
                if (!botIsAdmin) {
                    await reactTo(msg, settings.reactions.error);
                    await msg.reply('❌ لازم البوت يكون أدمن عشان يقدر يطرد.');
                    return;
                }
                if (!targetId) {
                    await reactTo(msg, settings.reactions.error);
                    await msg.reply('❌ اعمل منشن للشخص أو رد على رسالته مع *.طرد*.');
                    return;
                }
                await chat.removeParticipants([targetId]);
                await reactTo(msg, settings.reactions.success);
                await chat.sendMessage(
                    cardBox('تم الطرد 👢', [
                        `تم إخراج العضو بنجاح من *${chat.name}*.`
                    ])
                );
                return;
            }

            if (body.startsWith('.ترقيه') || body.startsWith('.ترقية')) {
                if (!senderIsAdmin) {
                    await reactTo(msg, settings.reactions.error);
                    await msg.reply('❌ الأمر ده للأدمن فقط.');
                    return;
                }
                if (!botIsAdmin) {
                    await reactTo(msg, settings.reactions.error);
                    await msg.reply('❌ لازم البوت يكون أدمن عشان يقدر يرقّي.');
                    return;
                }
                if (!targetId) {
                    await reactTo(msg, settings.reactions.error);
                    await msg.reply('❌ اعمل منشن للشخص أو رد على رسالته مع *.ترقيه*.');
                    return;
                }
                await chat.promoteParticipants([targetId]);
                await reactTo(msg, settings.reactions.success);
                await chat.sendMessage(
                    cardBox('ترقية إشراف 🛡️', [
                        `تمت ترقية العضو ليصبح أدمن في *${chat.name}*.`
                    ])
                );
                return;
            }

            if (body.startsWith('.توافق') || body.startsWith('.زواج')) {
                const mentions = msg.mentionedIds || [];
                const p1 = mentions[0]
                    ? extractLabel((await client.getContactById(mentions[0]).catch(() => null))?.pushname || '')
                    : userLabel;
                const p2 = mentions[1]
                    ? extractLabel((await client.getContactById(mentions[1]).catch(() => null))?.pushname || '')
                    : 'شريك عشوائي';
                const percent = Math.floor(Math.random() * 61) + 40;
                await reactTo(msg, settings.reactions.success);
                await chat.sendMessage(
                    cardBox('نسبة التوافق 💘', [
                        `💞 الطرف الأول: *${p1}*`,
                        `💞 الطرف الثاني: *${p2}*`,
                        `📊 النسبة: *${percent}%*`
                    ])
                );
                return;
            }

            if (body.startsWith('.محكمه') || body.startsWith('.محكمة')) {
                const accused = targetId
                    ? extractLabel((await client.getContactById(targetId).catch(() => null))?.pushname || '')
                    : userLabel;
                const verdicts = [
                    'براءة تامة مع الإشادة بالأخلاق ⚖️',
                    'حكم غرامي: يوزع حلويات على الجروب 🍰',
                    'حكم إداري: يغيّر لقبه إلى ~ مطيع القوانين 🛡️',
                    'إيقاف مؤقت عن الفلسفة لمدة ساعتين 😂'
                ];
                const chosen = verdicts[Math.floor(Math.random() * verdicts.length)];
                await reactTo(msg, settings.reactions.success);
                await chat.sendMessage(
                    cardBox('المحكمة العليا ⚖️', [
                        `👨‍⚖️ المتهم: *${accused}*`,
                        `📜 الحكم: ${chosen}`
                    ])
                );
                return;
            }
        }

        const roastEnabled = chat.isGroup
            ? Boolean(groupConf && groupConf.roastBack && globalRoastEnabled)
            : globalRoastEnabled;

        if (roastEnabled && bodyLower.length > 0 && settings.roastTriggers.some((w) => bodyLower.includes(w))) {
            const chosenRoast = settings.roastReplies[Math.floor(Math.random() * settings.roastReplies.length)];
            await reactTo(msg, settings.reactions.success);
            await msg.reply(chosenRoast);
            return;
        }

        if (body.length > 0) {
            await reactTo(msg, settings.reactions.general);
        }
    } catch (err) {
        await reactTo(msg, settings.reactions.error).catch(() => {});
        console.error('Message handling error:', err?.message || err);
    }
});

client.initialize();
