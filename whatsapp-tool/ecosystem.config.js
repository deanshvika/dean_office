module.exports = {
    apps: [{
        name: 'bot-server',
        script: 'server.js',
        restart_delay: 5000,
        max_restarts: 50,
        max_memory_restart: '1500M',
        watch: false,
        autorestart: true,
        log_date_format: 'DD/MM HH:mm:ss'
    }]
};
