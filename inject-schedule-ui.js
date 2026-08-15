const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, 'bizcrm_frontend_dist/assets/AiWorkspacePage-B5vl4fGm.js');
let content = fs.readFileSync(file, 'utf8');

// Check if already injected
if (content.includes('scStartHour') || content.includes('scEnHr')) {
  console.log('Already injected');
  process.exit(0);
}

// 1. Inject state hooks into function kt()
const targetState = 'function kt(){let{config:e,usage:n,providers:r,fetchConfig:a,updateConfig:o,fetchUsage:c,fetchProviders:l,saveApiKey:u,removeApiKey:f}=be(),';
const replaceState = targetState + '[scEn,setScEn]=(0,B.useState)(!0),[scSt,setScSt]=(0,B.useState)(8),[scEnHr,setScEnHr]=(0,B.useState)(18),[scDay,setScDay]=(0,B.useState)(`suggest`),[scNgt,setScNgt]=(0,B.useState)(`auto`),[scAft,setScAft]=(0,B.useState)(!1),[scSav,setScSav]=(0,B.useState)(!1),[scSvd,setScSvd]=(0,B.useState)(!1),';

if (!content.includes(targetState)) {
  console.error('Target state string not found!');
  process.exit(1);
}
content = content.replace(targetState, replaceState);

// 2. Inject useEffect for fetching schedule
const targetEffect = '(0,B.useEffect)(()=>{a(),c(),l()},[a,c,l]),';
const replaceEffect = targetEffect + '(0,B.useEffect)(()=>{F.get(`/ai/schedule`).then(e=>{let t=e.data;t?.schedule&&(setScEn(t.schedule.enabled??!0),setScSt(t.schedule.startHour??8),setScEnHr(t.schedule.endHour??18),setScDay(t.schedule.daytimeMode??`suggest`),setScNgt(t.schedule.nighttimeMode??`auto`),setScAft(t.isAfterHours??!1))}).catch(()=>{})},[]),';

content = content.replace(targetEffect, replaceEffect);

// 3. Inject saveSchedule method before return JSX
const saveFnCode = 'let scSave=async()=>{setScSav(!0);try{let e=await F.put(`/ai/schedule`,{enabled:scEn,startHour:Number(scSt),endHour:Number(scEnHr),daytimeMode:scDay,nighttimeMode:scNgt});e.data?.schedule&&setScAft(e.data.isAfterHours??!1),setScSvd(!0),P(`Đã lưu cấu hình khung giờ tự động thành công!`,`success`,3e3),setTimeout(()=>setScSvd(!1),2500)}catch{P(`Lưu cấu hình khung giờ thất bại`,`error`)}finally{setScSav(!1)}};';

const targetBeforeReturn = 'return(0,H.jsxs)(`div`,{className:`automation-content`,children:';
content = content.replace(targetBeforeReturn, saveFnCode + targetBeforeReturn);

// 4. Inject Schedule Card JSX right before the first section
const targetBox = '(0,H.jsxs)(`section`,{className:`ai-config__box`,children:[(0,H.jsxs)(`div`,{className:`ai-config__box-head`,children:[(0,H.jsxs)(`div`,{className:`ai-config__box-title`,children:[(0,H.jsx)(i,{size:15}),` Trả lời tự động (AI auto-reply)`]';

const scheduleBoxJSX = '(0,H.jsxs)(`section`,{className:`ai-config__box`,style:{border:`1px solid #93c5fd`,background:`#f8fafc`,marginBottom:20},children:[' +
  '(0,H.jsxs)(`div`,{className:`ai-config__box-head`,children:[' +
    '(0,H.jsxs)(`div`,{className:`ai-config__box-title`,style:{color:`#1d4ed8`,display:`flex`,alignItems:`center`,gap:8},children:[(0,H.jsx)(S,{size:16,color:`#1d4ed8`}),`⏰ Lịch trình tự động theo khung giờ (08h00 - 18h00 Người trực | 18h00 - 08h00 AI Auto)`]}),' +
    '(0,H.jsx)(`div`,{className:`ai-config__box-sub`,children:`Tự động chuyển đổi giữa Người thật CSKH (ban ngày) và AI tự động trả lời (sau 18h hàng ngày)`})' +
  ']}),' +
  '(0,H.jsxs)(`div`,{style:{padding:`12px 16px`,borderRadius:8,marginBottom:16,display:`flex`,alignItems:`center`,gap:12,background:scAft?`#f0fdf4`:`#eff6ff`,border:scAft?`1px solid #86efac`:`1px solid #bfdbfe`,color:scAft?`#166534`:`#1e40af`},children:[' +
    '(0,H.jsx)(`span`,{style:{fontSize:22},children:scAft?`🌙`:`☀️`}),' +
    '(0,H.jsxs)(`div`,{children:[' +
      '(0,H.jsx)(`div`,{style:{fontWeight:700,fontSize:13.5},children:scAft?`HIỆN TẠI: Đang ngoài giờ làm việc (Sau 18h00) — AI đang TỰ ĐỘNG trả lời khách hàng`:`HIỆN TẠI: Đang trong giờ làm việc (08h00 - 18h00) — Nhân viên CSKH trực tiếp trả lời (AI tạo bản nháp gợi ý)`}),' +
      '(0,H.jsx)(`div`,{style:{fontSize:12,opacity:.85,marginTop:2},children:scAft?`Mọi tin nhắn từ khách hàng sẽ được AI tự động phân tích và phản hồi ngay lập tức.`:`Tin nhắn khách gửi sẽ do nhân viên trực duyệt và bấm gửi, AI không tự ý gửi tin.`})' +
    ']})' +
  ']}),' +
  '(0,H.jsxs)(`div`,{className:`ai-config__row`,children:[' +
    '(0,H.jsxs)(`div`,{children:[' +
      '(0,H.jsx)(`div`,{className:`ai-config__row-title`,children:`Bật điều khiển theo khung giờ`}),' +
      '(0,H.jsx)(`div`,{className:`ai-config__row-desc`,children:`Tự động chuyển chế độ AI Auto sau 18h00 và Suggest ban ngày (GMT+7)`})' +
    ']}),' +
    '(0,H.jsxs)(`label`,{className:`ai-config__toggle`,children:[' +
      '(0,H.jsx)(`input`,{type:`checkbox`,checked:scEn,onChange:e=>setScEn(e.target.checked),className:`ai-config__toggle-input`}),' +
      '(0,H.jsx)(`span`,{className:`ai-config__toggle-track ${scEn?`ai-config__toggle-track--on`:``}`}),' +
      '(0,H.jsx)(`span`,{className:`ai-config__toggle-knob ${scEn?`ai-config__toggle-knob--on`:``}`})' +
    ']})' +
  ']}),' +
  'scEn&&(0,H.jsxs)(`div`,{style:{display:`grid`,gridTemplateColumns:`1fr 1fr`,gap:16,marginTop:12,marginBottom:12},children:[' +
    '(0,H.jsxs)(`div`,{style:{padding:16,background:`#ffffff`,borderRadius:8,border:`1px solid #e2e8f0`},children:[' +
      '(0,H.jsx)(`div`,{style:{fontWeight:600,fontSize:13,color:`#1e293b`,marginBottom:8},children:`☀️ Khung giờ Ban Ngày (CSKH trực)`}),' +
      '(0,H.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:8,marginBottom:10},children:[' +
        '(0,H.jsx)(`span`,{style:{fontSize:12,color:`#64748b`},children:`Từ:`}),' +
        '(0,H.jsx)(`select`,{className:`form-control`,style:{width:90,padding:`4px 8px`},value:scSt,onChange:e=>setScSt(Number(e.target.value)),children:Array.from({length:24}).map((e,t)=>(0,H.jsx)(`option`,{value:t,children:`${String(t).padStart(2,`0`)}:00`},t))}),' +
        '(0,H.jsx)(`span`,{style:{fontSize:12,color:`#64748b`},children:`Đến:`}),' +
        '(0,H.jsx)(`select`,{className:`form-control`,style:{width:90,padding:`4px 8px`},value:scEnHr,onChange:e=>setScEnHr(Number(e.target.value)),children:Array.from({length:24}).map((e,t)=>(0,H.jsx)(`option`,{value:t,children:`${String(t).padStart(2,`0`)}:00`},t))})' +
      ']}),' +
      '(0,H.jsxs)(`div`,{children:[' +
        '(0,H.jsx)(`label`,{style:{display:`block`,fontSize:12,color:`#64748b`,marginBottom:4},children:`Chế độ ban ngày:`}),' +
        '(0,H.jsxs)(`select`,{className:`form-control`,value:scDay,onChange:e=>setScDay(e.target.value),children:[' +
          '(0,H.jsx)(`option`,{value:`suggest`,children:`Gợi ý nháp (CSKH duyệt gửi)`}),' +
          '(0,H.jsx)(`option`,{value:`manual`,children:`Thủ công (Tắt AI)`})' +
        ']})' +
      ']})' +
    ']}),' +
    '(0,H.jsxs)(`div`,{style:{padding:16,background:`#ffffff`,borderRadius:8,border:`1px solid #e2e8f0`},children:[' +
      '(0,H.jsx)(`div`,{style:{fontWeight:600,fontSize:13,color:`#1e293b`,marginBottom:8},children:`🌙 Khung giờ Buổi Tối / Ngoài Giờ`}),' +
      '(0,H.jsxs)(`div`,{style:{fontSize:12,color:`#64748b`,marginBottom:16,paddingTop:4},children:[`Từ `,String(scEnHr).padStart(2,`0`),`:00 tối đến `,String(scSt).padStart(2,`0`),`:00 sáng hôm sau`]}),' +
      '(0,H.jsxs)(`div`,{children:[' +
        '(0,H.jsx)(`label`,{style:{display:`block`,fontSize:12,color:`#64748b`,marginBottom:4},children:`Chế độ ngoài giờ:`}),' +
        '(0,H.jsxs)(`select`,{className:`form-control`,value:scNgt,onChange:e=>setScNgt(e.target.value),children:[' +
          '(0,H.jsx)(`option`,{value:`auto`,children:`Tự động trả lời khách (AI Auto)`}),' +
          '(0,H.jsx)(`option`,{value:`suggest`,children:`Gợi ý nháp (Suggest)`})' +
        ']})' +
      ']})' +
    ']})' +
  ']}),' +
  '(0,H.jsxs)(`div`,{className:`ai-config__ar-save`,children:[' +
    '(0,H.jsxs)(`button`,{type:`button`,className:`ai-config__btn ai-config__btn--primary`,style:{background:`#2563eb`},onClick:scSave,disabled:scSav,children:[(0,H.jsx)(t,{size:13}),` `,scSav?`Đang lưu...`:scSvd?`✓ Đã lưu lịch trình`:`Lưu cài đặt khung giờ`]})' +
  ']})' +
']}),';

content = content.replace(targetBox, scheduleBoxJSX + targetBox);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully injected schedule component into AiWorkspacePage!');
