import https from 'https';

const url = "https://mqtyjzdwwgeycvmbiqsg.supabase.co/rest/v1/app_apontadores?select=*&limit=1";
const options = {
  headers: {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xdHlqemR3d2dleWN2bWJpcXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDkwODYsImV4cCI6MjA5NTM4NTA4Nn0.rNPwuckpVrQ26J_CFaH6pUPnD2iIUjyxjJZjE6zL6t0",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xdHlqemR3d2dleWN2bWJpcXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDkwODYsImV4cCI6MjA5NTM4NTA4Nn0.rNPwuckpVrQ26J_CFaH6pUPnD2iIUjyxjJZjE6zL6t0"
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
}).on('error', err => console.log(err.message));
