npm init -y && npm install whatsapp-web.js qrcode-terminal && cat << 'EOF' > settings.js
module.exports = {
    defaultPhoneNumber: process.env.PHONE_NUMBER || '201119815696',
    ownerSignature: 'اللي بينيكك',
    reactions: {
        success: '☑️',
        error: '❌',
        general: '👾'
    },
    roastTriggers: ['كسمك', 'عرص', 'تيز', 'خول', 'متناك', 'شرموط'],
    roastReplies: [
        'خليك محترم شوية 😂',
        'مش مستاهلة العصبية دي، اهدى 😉',
        'الرد عندي جاهز بس خلينا في المهم 😎'
    ]
};
EOF
