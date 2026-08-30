(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const o of s)if(o.type==="childList")for(const a of o.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&i(a)}).observe(document,{childList:!0,subtree:!0});function t(s){const o={};return s.integrity&&(o.integrity=s.integrity),s.referrerPolicy&&(o.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?o.credentials="include":s.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function i(s){if(s.ep)return;s.ep=!0;const o=t(s);fetch(s.href,o)}})();const Z="chatmql_m_token",oe="chatmql_m_refresh",Ce="chatmql_m_user",w={token:()=>localStorage.getItem(Z)||"",refreshToken:()=>localStorage.getItem(oe)||"",user(){try{return JSON.parse(localStorage.getItem(Ce)||"null")}catch{return null}},save({token:n,refreshToken:e,user:t}){localStorage.setItem(Z,n),e&&localStorage.setItem(oe,e),t&&localStorage.setItem(Ce,JSON.stringify(t))},update(n,e){localStorage.setItem(Z,n),e&&localStorage.setItem(oe,e)},clear(){localStorage.removeItem(Z),localStorage.removeItem(oe),localStorage.removeItem(Ce)},isLoggedIn(){return!!localStorage.getItem(Z)}},se=location.hostname==="localhost"||location.hostname==="127.0.0.1"?"http://localhost:4520":"";let ae=null;async function Et(){return ae||(ae=(async()=>{const n=w.refreshToken();if(!n)return!1;try{const e=await fetch(`${se}/api/v1/auth/refresh`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refreshToken:n})});if(!e.ok)return!1;const t=await e.json();return t.token?(w.update(t.token,t.refreshToken),!0):!1}catch{return!1}finally{setTimeout(()=>{ae=null},0)}})()),ae}async function G(n,e,t,i={}){const s={...i.headers||{}};t!==void 0&&(s["Content-Type"]="application/json");const o=w.token();o&&(s.Authorization=`Bearer ${o}`);let a;try{a=await fetch(`${se}${e}`,{method:n,headers:s,body:t!==void 0?JSON.stringify(t):void 0,signal:i.signal})}catch(c){throw(c==null?void 0:c.name)==="AbortError"?c:new he(0,"Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.")}if(a.status===401&&!i._retried&&w.refreshToken()){if(await Et())return G(n,e,t,{...i,_retried:!0});throw w.clear(),location.reload(),new he(401,"Phiên làm việc đã hết hạn")}const r=await a.json().catch(()=>null);if(!a.ok)throw new he(a.status,(r==null?void 0:r.error)||(r==null?void 0:r.message)||`Lỗi ${a.status}`,r);return r}class he extends Error{constructor(e,t,i){super(t),this.status=e,this.data=i}}const g={get:(n,e)=>G("GET",n,void 0,e),post:(n,e,t)=>G("POST",n,e,t),put:(n,e,t)=>G("PUT",n,e,t),patch:(n,e,t)=>G("PATCH",n,e,t),del:(n,e)=>G("DELETE",n,void 0,e)};function St(n){if(w.isLoggedIn()){n();return}const e=document.createElement("div");e.id="login-gate",e.innerHTML=`
    <style>
      #login-gate{position:fixed; inset:0; z-index:999; background:#f6f8fa;
        display:flex; align-items:center; justify-content:center; padding:24px;}
      .lg-card{width:100%; max-width:360px; background:#fff; border-radius:16px;
        padding:28px 22px; box-shadow:0 8px 30px rgba(15,23,42,.08);}
      .lg-logo{text-align:center; margin-bottom:6px; font-size:34px;}
      .lg-title{text-align:center; font-size:17px; font-weight:800; color:#0f172a;}
      .lg-sub{text-align:center; font-size:12.5px; color:#64748b; margin:4px 0 20px;}
      .lg-label{font-size:12.5px; font-weight:600; color:#334155; margin:12px 0 5px; display:block;}
      .lg-input{width:100%; box-sizing:border-box; border:1.5px solid #e2e8f0; border-radius:12px;
        padding:12px 14px; font-size:15px; outline:none; background:#f8fafc;}
      .lg-input:focus{border-color:var(--primary,#0D6838); background:#fff;}
      .lg-btn{width:100%; margin-top:18px; border:none; border-radius:12px; padding:13px;
        font-size:15px; font-weight:700; color:#fff; background:var(--primary,#0D6838); cursor:pointer;}
      .lg-btn:disabled{opacity:.6;}
      .lg-err{min-height:18px; font-size:12.5px; color:#b91c1c; margin-top:10px; text-align:center;}
    </style>
    <form class="lg-card" id="lg-form">
      <div class="lg-logo">🍃</div>
      <div class="lg-title">Trà Dược Việt Nam</div>
      <div class="lg-sub">ChatMQL bản điện thoại</div>
      <label class="lg-label" for="lg-email">Email</label>
      <input class="lg-input" id="lg-email" type="email" autocomplete="username"
             inputmode="email" placeholder="ten@traduoc.ai" required>
      <label class="lg-label" for="lg-pass">Mật khẩu</label>
      <input class="lg-input" id="lg-pass" type="password"
             autocomplete="current-password" placeholder="••••••••" required>
      <button class="lg-btn" id="lg-submit" type="submit">Đăng nhập</button>
      <div class="lg-err" id="lg-err"></div>
    </form>`,document.body.appendChild(e);const t=e.querySelector("#lg-form"),i=e.querySelector("#lg-err"),s=e.querySelector("#lg-submit");t.onsubmit=async o=>{o.preventDefault(),i.textContent="",s.disabled=!0,s.textContent="Đang đăng nhập…";try{const a=await g.post("/api/v1/auth/login",{email:e.querySelector("#lg-email").value.trim(),password:e.querySelector("#lg-pass").value});w.save(a),e.remove(),n()}catch(a){i.textContent=a instanceof he&&a.status===401?"Email hoặc mật khẩu chưa đúng.":a.message||"Không đăng nhập được, thử lại giúp em.",s.disabled=!1,s.textContent="Đăng nhập"}}}function Lt(){w.clear(),location.reload()}const O=Object.create(null);O.open="0";O.close="1";O.ping="2";O.pong="3";O.message="4";O.upgrade="5";O.noop="6";const ue=Object.create(null);Object.keys(O).forEach(n=>{ue[O[n]]=n});const Be={type:"error",data:"parser error"},rt=typeof Blob=="function"||typeof Blob<"u"&&Object.prototype.toString.call(Blob)==="[object BlobConstructor]",ct=typeof ArrayBuffer=="function",lt=n=>typeof ArrayBuffer.isView=="function"?ArrayBuffer.isView(n):n&&n.buffer instanceof ArrayBuffer,Ke=({type:n,data:e},t,i)=>rt&&e instanceof Blob?t?i(e):We(e,i):ct&&(e instanceof ArrayBuffer||lt(e))?t?i(e):We(new Blob([e]),i):i(O[n]+(e||"")),We=(n,e)=>{const t=new FileReader;return t.onload=function(){const i=t.result.split(",")[1];e("b"+(i||""))},t.readAsDataURL(n)};function Xe(n){return n instanceof Uint8Array?n:n instanceof ArrayBuffer?new Uint8Array(n):new Uint8Array(n.buffer,n.byteOffset,n.byteLength)}let Ee;function Nt(n,e){if(rt&&n.data instanceof Blob)return n.data.arrayBuffer().then(Xe).then(e);if(ct&&(n.data instanceof ArrayBuffer||lt(n.data)))return e(Xe(n.data));Ke(n,!1,t=>{Ee||(Ee=new TextEncoder),e(Ee.encode(t))})}const Qe="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",ne=typeof Uint8Array>"u"?[]:new Uint8Array(256);for(let n=0;n<Qe.length;n++)ne[Qe.charCodeAt(n)]=n;const Bt=n=>{let e=n.length*.75,t=n.length,i,s=0,o,a,r,c;n[n.length-1]==="="&&(e--,n[n.length-2]==="="&&e--);const l=new ArrayBuffer(e),d=new Uint8Array(l);for(i=0;i<t;i+=4)o=ne[n.charCodeAt(i)],a=ne[n.charCodeAt(i+1)],r=ne[n.charCodeAt(i+2)],c=ne[n.charCodeAt(i+3)],d[s++]=o<<2|a>>4,d[s++]=(a&15)<<4|r>>2,d[s++]=(r&3)<<6|c&63;return l},It=typeof ArrayBuffer=="function",je=(n,e)=>{if(typeof n!="string")return{type:"message",data:dt(n,e)};const t=n.charAt(0);return t==="b"?{type:"message",data:At(n.substring(1),e)}:ue[t]?n.length>1?{type:ue[t],data:n.substring(1)}:{type:ue[t]}:Be},At=(n,e)=>{if(It){const t=Bt(n);return dt(t,e)}else return{base64:!0,data:n}},dt=(n,e)=>{switch(e){case"blob":return n instanceof Blob?n:new Blob([n]);case"arraybuffer":default:return n instanceof ArrayBuffer?n:n.buffer}},ht="",Mt=(n,e)=>{const t=n.length,i=new Array(t);let s=0;n.forEach((o,a)=>{Ke(o,!1,r=>{i[a]=r,++s===t&&e(i.join(ht))})})},Ht=(n,e)=>{const t=n.split(ht),i=[];for(let s=0;s<t.length;s++){const o=je(t[s],e);if(i.push(o),o.type==="error")break}return i};function qt(){return new TransformStream({transform(n,e){Nt(n,t=>{const i=t.length;let s;if(i<126)s=new Uint8Array(1),new DataView(s.buffer).setUint8(0,i);else if(i<65536){s=new Uint8Array(3);const o=new DataView(s.buffer);o.setUint8(0,126),o.setUint16(1,i)}else{s=new Uint8Array(9);const o=new DataView(s.buffer);o.setUint8(0,127),o.setBigUint64(1,BigInt(i))}n.data&&typeof n.data!="string"&&(s[0]|=128),e.enqueue(s),e.enqueue(t)})}})}let Se;function re(n){return n.reduce((e,t)=>e+t.length,0)}function ce(n,e){if(n[0].length===e)return n.shift();const t=new Uint8Array(e);let i=0;for(let s=0;s<e;s++)t[s]=n[0][i++],i===n[0].length&&(n.shift(),i=0);return n.length&&i<n[0].length&&(n[0]=n[0].slice(i)),t}function Rt(n,e){Se||(Se=new TextDecoder);const t=[];let i=0,s=-1,o=!1;return new TransformStream({transform(a,r){for(t.push(a);;){if(i===0){if(re(t)<1)break;const c=ce(t,1);o=(c[0]&128)===128,s=c[0]&127,s<126?i=3:s===126?i=1:i=2}else if(i===1){if(re(t)<2)break;const c=ce(t,2);s=new DataView(c.buffer,c.byteOffset,c.length).getUint16(0),i=3}else if(i===2){if(re(t)<8)break;const c=ce(t,8),l=new DataView(c.buffer,c.byteOffset,c.length),d=l.getUint32(0);if(d>Math.pow(2,21)-1){r.enqueue(Be);break}s=d*Math.pow(2,32)+l.getUint32(4),i=3}else{if(re(t)<s)break;const c=ce(t,s);r.enqueue(je(o?c:Se.decode(c),e)),i=0}if(s===0||s>n){r.enqueue(Be);break}}}})}const ut=4;function x(n){if(n)return Ot(n)}function Ot(n){for(var e in x.prototype)n[e]=x.prototype[e];return n}x.prototype.on=x.prototype.addEventListener=function(n,e){return this._callbacks=this._callbacks||{},(this._callbacks["$"+n]=this._callbacks["$"+n]||[]).push(e),this};x.prototype.once=function(n,e){function t(){this.off(n,t),e.apply(this,arguments)}return t.fn=e,this.on(n,t),this};x.prototype.off=x.prototype.removeListener=x.prototype.removeAllListeners=x.prototype.removeEventListener=function(n,e){if(this._callbacks=this._callbacks||{},arguments.length==0)return this._callbacks={},this;var t=this._callbacks["$"+n];if(!t)return this;if(arguments.length==1)return delete this._callbacks["$"+n],this;for(var i,s=0;s<t.length;s++)if(i=t[s],i===e||i.fn===e){t.splice(s,1);break}return t.length===0&&delete this._callbacks["$"+n],this};x.prototype.emit=function(n){this._callbacks=this._callbacks||{};for(var e=new Array(arguments.length-1),t=this._callbacks["$"+n],i=1;i<arguments.length;i++)e[i-1]=arguments[i];if(t){t=t.slice(0);for(var i=0,s=t.length;i<s;++i)t[i].apply(this,e)}return this};x.prototype.emitReserved=x.prototype.emit;x.prototype.listeners=function(n){return this._callbacks=this._callbacks||{},this._callbacks["$"+n]||[]};x.prototype.hasListeners=function(n){return!!this.listeners(n).length};const xe=typeof Promise=="function"&&typeof Promise.resolve=="function"?e=>Promise.resolve().then(e):(e,t)=>t(e,0),H=typeof self<"u"?self:typeof window<"u"?window:Function("return this")(),Pt="arraybuffer";function pt(n,...e){return e.reduce((t,i)=>(n.hasOwnProperty(i)&&(t[i]=n[i]),t),{})}const Dt=H.setTimeout,$t=H.clearTimeout;function Te(n,e){e.useNativeTimers?(n.setTimeoutFn=Dt.bind(H),n.clearTimeoutFn=$t.bind(H)):(n.setTimeoutFn=H.setTimeout.bind(H),n.clearTimeoutFn=H.clearTimeout.bind(H))}const Vt=1.33;function Kt(n){return typeof n=="string"?jt(n):Math.ceil((n.byteLength||n.size)*Vt)}function jt(n){let e=0,t=0;for(let i=0,s=n.length;i<s;i++)e=n.charCodeAt(i),e<128?t+=1:e<2048?t+=2:e<55296||e>=57344?t+=3:(i++,t+=4);return t}function ft(){return Date.now().toString(36).substring(3)+Math.random().toString(36).substring(2,5)}function zt(n){let e="";for(let t in n)n.hasOwnProperty(t)&&(e.length&&(e+="&"),e+=encodeURIComponent(t)+"="+encodeURIComponent(n[t]));return e}function Ft(n){let e={},t=n.split("&");for(let i=0,s=t.length;i<s;i++){let o=t[i].split("=");e[decodeURIComponent(o[0])]=decodeURIComponent(o[1])}return e}class Ut extends Error{constructor(e,t,i){super(e),this.description=t,this.context=i,this.type="TransportError"}}class ze extends x{constructor(e){super(),this.writable=!1,Te(this,e),this.opts=e,this.query=e.query,this.socket=e.socket,this.supportsBinary=!e.forceBase64}onError(e,t,i){return super.emitReserved("error",new Ut(e,t,i)),this}open(){return this.readyState="opening",this.doOpen(),this}close(){return(this.readyState==="opening"||this.readyState==="open")&&(this.doClose(),this.onClose()),this}send(e){this.readyState==="open"&&this.write(e)}onOpen(){this.readyState="open",this.writable=!0,super.emitReserved("open")}onData(e){const t=je(e,this.socket.binaryType);this.onPacket(t)}onPacket(e){super.emitReserved("packet",e)}onClose(e){this.readyState="closed",super.emitReserved("close",e)}pause(e){}createUri(e,t={}){return e+"://"+this._hostname()+this._port()+this.opts.path+this._query(t)}_hostname(){const e=this.opts.hostname;return e.indexOf(":")===-1?e:"["+e+"]"}_port(){return this.opts.port&&(this.opts.secure&&Number(this.opts.port)!==443||!this.opts.secure&&Number(this.opts.port)!==80)?":"+this.opts.port:""}_query(e){const t=zt(e);return t.length?"?"+t:""}}class Gt extends ze{constructor(){super(...arguments),this._polling=!1}get name(){return"polling"}doOpen(){this._poll()}pause(e){this.readyState="pausing";const t=()=>{this.readyState="paused",e()};if(this._polling||!this.writable){let i=0;this._polling&&(i++,this.once("pollComplete",function(){--i||t()})),this.writable||(i++,this.once("drain",function(){--i||t()}))}else t()}_poll(){this._polling=!0,this.doPoll(),this.emitReserved("poll")}onData(e){const t=i=>{if(this.readyState==="opening"&&i.type==="open"&&this.onOpen(),i.type==="close")return this.onClose({description:"transport closed by the server"}),!1;this.onPacket(i)};Ht(e,this.socket.binaryType).forEach(t),this.readyState!=="closed"&&(this._polling=!1,this.emitReserved("pollComplete"),this.readyState==="open"&&this._poll())}doClose(){const e=()=>{this.write([{type:"close"}])};this.readyState==="open"?e():this.once("open",e)}write(e){this.writable=!1,Mt(e,t=>{this.doWrite(t,()=>{this.writable=!0,this.emitReserved("drain")})})}uri(){const e=this.opts.secure?"https":"http",t=this.query||{};return this.opts.timestampRequests!==!1&&(t[this.opts.timestampParam]=ft()),!this.supportsBinary&&!t.sid&&(t.b64=1),this.createUri(e,t)}}let vt=!1;try{vt=typeof XMLHttpRequest<"u"&&"withCredentials"in new XMLHttpRequest}catch{}const Wt=vt;function Xt(){}class Qt extends Gt{constructor(e){if(super(e),typeof location<"u"){const t=location.protocol==="https:";let i=location.port;i||(i=t?"443":"80"),this.xd=typeof location<"u"&&e.hostname!==location.hostname||i!==e.port}}doWrite(e,t){const i=this.request({method:"POST",data:e});i.on("success",t),i.on("error",(s,o)=>{this.onError("xhr post error",s,o)})}doPoll(){const e=this.request();e.on("data",this.onData.bind(this)),e.on("error",(t,i)=>{this.onError("xhr poll error",t,i)}),this.pollXhr=e}}class R extends x{constructor(e,t,i){super(),this.createRequest=e,Te(this,i),this._opts=i,this._method=i.method||"GET",this._uri=t,this._data=i.data!==void 0?i.data:null,this._create()}_create(){var e;const t=pt(this._opts,"agent","pfx","key","passphrase","cert","ca","ciphers","rejectUnauthorized","autoUnref");t.xdomain=!!this._opts.xd;const i=this._xhr=this.createRequest(t);try{i.open(this._method,this._uri,!0);try{if(this._opts.extraHeaders){i.setDisableHeaderCheck&&i.setDisableHeaderCheck(!0);for(let s in this._opts.extraHeaders)this._opts.extraHeaders.hasOwnProperty(s)&&i.setRequestHeader(s,this._opts.extraHeaders[s])}}catch{}if(this._method==="POST")try{i.setRequestHeader("Content-type","text/plain;charset=UTF-8")}catch{}try{i.setRequestHeader("Accept","*/*")}catch{}(e=this._opts.cookieJar)===null||e===void 0||e.addCookies(i),"withCredentials"in i&&(i.withCredentials=this._opts.withCredentials),this._opts.requestTimeout&&(i.timeout=this._opts.requestTimeout),i.onreadystatechange=()=>{var s;i.readyState===3&&((s=this._opts.cookieJar)===null||s===void 0||s.parseCookies(i.getResponseHeader("set-cookie"))),i.readyState===4&&(i.status===200||i.status===1223?this._onLoad():this.setTimeoutFn(()=>{this._onError(typeof i.status=="number"?i.status:0)},0))},i.send(this._data)}catch(s){this.setTimeoutFn(()=>{this._onError(s)},0);return}typeof document<"u"&&(this._index=R.requestsCount++,R.requests[this._index]=this)}_onError(e){this.emitReserved("error",e,this._xhr),this._cleanup(!0)}_cleanup(e){if(!(typeof this._xhr>"u"||this._xhr===null)){if(this._xhr.onreadystatechange=Xt,e)try{this._xhr.abort()}catch{}typeof document<"u"&&delete R.requests[this._index],this._xhr=null}}_onLoad(){const e=this._xhr.responseText;e!==null&&(this.emitReserved("data",e),this.emitReserved("success"),this._cleanup())}abort(){this._cleanup()}}R.requestsCount=0;R.requests={};if(typeof document<"u"){if(typeof attachEvent=="function")attachEvent("onunload",Je);else if(typeof addEventListener=="function"){const n="onpagehide"in H?"pagehide":"unload";addEventListener(n,Je,!1)}}function Je(){for(let n in R.requests)R.requests.hasOwnProperty(n)&&R.requests[n].abort()}const Jt=function(){const n=mt({xdomain:!1});return n&&n.responseType!==null}();class Yt extends Qt{constructor(e){super(e);const t=e&&e.forceBase64;this.supportsBinary=Jt&&!t}request(e={}){return Object.assign(e,{xd:this.xd},this.opts),new R(mt,this.uri(),e)}}function mt(n){const e=n.xdomain;try{if(typeof XMLHttpRequest<"u"&&(!e||Wt))return new XMLHttpRequest}catch{}if(!e)try{return new H[["Active"].concat("Object").join("X")]("Microsoft.XMLHTTP")}catch{}}const gt=typeof navigator<"u"&&typeof navigator.product=="string"&&navigator.product.toLowerCase()==="reactnative";class Zt extends ze{get name(){return"websocket"}doOpen(){const e=this.uri(),t=this.opts.protocols,i=gt?{}:pt(this.opts,"agent","perMessageDeflate","pfx","key","passphrase","cert","ca","ciphers","rejectUnauthorized","localAddress","protocolVersion","origin","maxPayload","family","checkServerIdentity");this.opts.extraHeaders&&(i.headers=this.opts.extraHeaders);try{this.ws=this.createSocket(e,t,i)}catch(s){return this.emitReserved("error",s)}this.ws.binaryType=this.socket.binaryType,this.addEventListeners()}addEventListeners(){this.ws.onopen=()=>{this.opts.autoUnref&&this.ws._socket.unref(),this.onOpen()},this.ws.onclose=e=>this.onClose({description:"websocket connection closed",context:e}),this.ws.onmessage=e=>this.onData(e.data),this.ws.onerror=e=>this.onError("websocket error",e)}write(e){this.writable=!1;for(let t=0;t<e.length;t++){const i=e[t],s=t===e.length-1;Ke(i,this.supportsBinary,o=>{try{this.doWrite(i,o)}catch{}s&&xe(()=>{this.writable=!0,this.emitReserved("drain")},this.setTimeoutFn)})}}doClose(){typeof this.ws<"u"&&(this.ws.onerror=()=>{},this.ws.close(),this.ws=null)}uri(){const e=this.opts.secure?"wss":"ws",t=this.query||{};return this.opts.timestampRequests&&(t[this.opts.timestampParam]=ft()),this.supportsBinary||(t.b64=1),this.createUri(e,t)}}const Le=H.WebSocket||H.MozWebSocket;class en extends Zt{createSocket(e,t,i){return gt?new Le(e,t,i):t?new Le(e,t):new Le(e)}doWrite(e,t){this.ws.send(t)}}class tn extends ze{get name(){return"webtransport"}doOpen(){try{this._transport=new WebTransport(this.createUri("https"),this.opts.transportOptions[this.name])}catch(e){return this.emitReserved("error",e)}this._transport.closed.then(()=>{this.onClose()}).catch(e=>{this.onError("webtransport error",e)}),this._transport.ready.then(()=>{this._transport.createBidirectionalStream().then(e=>{const t=Rt(Number.MAX_SAFE_INTEGER,this.socket.binaryType),i=e.readable.pipeThrough(t).getReader(),s=qt();s.readable.pipeTo(e.writable),this._writer=s.writable.getWriter();const o=()=>{i.read().then(({done:r,value:c})=>{r||(this.onPacket(c),o())}).catch(r=>{})};o();const a={type:"open"};this.query.sid&&(a.data=`{"sid":"${this.query.sid}"}`),this._writer.write(a).then(()=>this.onOpen())})})}write(e){this.writable=!1;for(let t=0;t<e.length;t++){const i=e[t],s=t===e.length-1;this._writer.write(i).then(()=>{s&&xe(()=>{this.writable=!0,this.emitReserved("drain")},this.setTimeoutFn)})}}doClose(){var e;(e=this._transport)===null||e===void 0||e.close()}}const nn={websocket:en,webtransport:tn,polling:Yt},sn=/^(?:(?![^:@\/?#]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@\/?#]*)(?::([^:@\/?#]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/,on=["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"];function Ie(n){if(n.length>8e3)throw"URI too long";const e=n,t=n.indexOf("["),i=n.indexOf("]");t!=-1&&i!=-1&&(n=n.substring(0,t)+n.substring(t,i).replace(/:/g,";")+n.substring(i,n.length));let s=sn.exec(n||""),o={},a=14;for(;a--;)o[on[a]]=s[a]||"";return t!=-1&&i!=-1&&(o.source=e,o.host=o.host.substring(1,o.host.length-1).replace(/;/g,":"),o.authority=o.authority.replace("[","").replace("]","").replace(/;/g,":"),o.ipv6uri=!0),o.pathNames=an(o,o.path),o.queryKey=rn(o,o.query),o}function an(n,e){const t=/\/{2,9}/g,i=e.replace(t,"/").split("/");return(e.slice(0,1)=="/"||e.length===0)&&i.splice(0,1),e.slice(-1)=="/"&&i.splice(i.length-1,1),i}function rn(n,e){const t={};return e.replace(/(?:^|&)([^&=]*)=?([^&]*)/g,function(i,s,o){s&&(t[s]=o)}),t}const Ae=typeof addEventListener=="function"&&typeof removeEventListener=="function",pe=[];Ae&&addEventListener("offline",()=>{pe.forEach(n=>n())},!1);class D extends x{constructor(e,t){if(super(),this.binaryType=Pt,this.writeBuffer=[],this._prevBufferLen=0,this._pingInterval=-1,this._pingTimeout=-1,this._maxPayload=-1,this._pingTimeoutTime=1/0,e&&typeof e=="object"&&(t=e,e=null),e){const i=Ie(e);t.hostname=i.host,t.secure=i.protocol==="https"||i.protocol==="wss",t.port=i.port,i.query&&(t.query=i.query)}else t.host&&(t.hostname=Ie(t.host).host);Te(this,t),this.secure=t.secure!=null?t.secure:typeof location<"u"&&location.protocol==="https:",t.hostname&&!t.port&&(t.port=this.secure?"443":"80"),this.hostname=t.hostname||(typeof location<"u"?location.hostname:"localhost"),this.port=t.port||(typeof location<"u"&&location.port?location.port:this.secure?"443":"80"),this.transports=[],this._transportsByName={},t.transports.forEach(i=>{const s=i.prototype.name;this.transports.push(s),this._transportsByName[s]=i}),this.opts=Object.assign({path:"/engine.io",agent:!1,withCredentials:!1,upgrade:!0,timestampParam:"t",rememberUpgrade:!1,addTrailingSlash:!0,rejectUnauthorized:!0,perMessageDeflate:{threshold:1024},transportOptions:{},closeOnBeforeunload:!1},t),this.opts.path=this.opts.path.replace(/\/$/,"")+(this.opts.addTrailingSlash?"/":""),typeof this.opts.query=="string"&&(this.opts.query=Ft(this.opts.query)),Ae&&(this.opts.closeOnBeforeunload&&(this._beforeunloadEventListener=()=>{this.transport&&(this.transport.removeAllListeners(),this.transport.close())},addEventListener("beforeunload",this._beforeunloadEventListener,!1)),this.hostname!=="localhost"&&(this._offlineEventListener=()=>{this._onClose("transport close",{description:"network connection lost"})},pe.push(this._offlineEventListener))),this.opts.withCredentials&&(this._cookieJar=void 0),this._open()}createTransport(e){const t=Object.assign({},this.opts.query);t.EIO=ut,t.transport=e,this.id&&(t.sid=this.id);const i=Object.assign({},this.opts,{query:t,socket:this,hostname:this.hostname,secure:this.secure,port:this.port},this.opts.transportOptions[e]);return new this._transportsByName[e](i)}_open(){if(this.transports.length===0){this.setTimeoutFn(()=>{this.emitReserved("error","No transports available")},0);return}const e=this.opts.rememberUpgrade&&D.priorWebsocketSuccess&&this.transports.indexOf("websocket")!==-1?"websocket":this.transports[0];this.readyState="opening";const t=this.createTransport(e);t.open(),this.setTransport(t)}setTransport(e){this.transport&&this.transport.removeAllListeners(),this.transport=e,e.on("drain",this._onDrain.bind(this)).on("packet",this._onPacket.bind(this)).on("error",this._onError.bind(this)).on("close",t=>this._onClose("transport close",t))}onOpen(){this.readyState="open",D.priorWebsocketSuccess=this.transport.name==="websocket",this.emitReserved("open"),this.flush()}_onPacket(e){if(this.readyState==="opening"||this.readyState==="open"||this.readyState==="closing")switch(this.emitReserved("packet",e),this.emitReserved("heartbeat"),e.type){case"open":this.onHandshake(JSON.parse(e.data));break;case"ping":this._sendPacket("pong"),this.emitReserved("ping"),this.emitReserved("pong"),this._resetPingTimeout();break;case"error":const t=new Error("server error");t.code=e.data,this._onError(t);break;case"message":this.emitReserved("data",e.data),this.emitReserved("message",e.data);break}}onHandshake(e){this.emitReserved("handshake",e),this.id=e.sid,this.transport.query.sid=e.sid,this._pingInterval=e.pingInterval,this._pingTimeout=e.pingTimeout,this._maxPayload=e.maxPayload,this.onOpen(),this.readyState!=="closed"&&this._resetPingTimeout()}_resetPingTimeout(){this.clearTimeoutFn(this._pingTimeoutTimer);const e=this._pingInterval+this._pingTimeout;this._pingTimeoutTime=Date.now()+e,this._pingTimeoutTimer=this.setTimeoutFn(()=>{this._onClose("ping timeout")},e),this.opts.autoUnref&&this._pingTimeoutTimer.unref()}_onDrain(){this.writeBuffer.splice(0,this._prevBufferLen),this._prevBufferLen=0,this.writeBuffer.length===0?this.emitReserved("drain"):this.flush()}flush(){if(this.readyState!=="closed"&&this.transport.writable&&!this.upgrading&&this.writeBuffer.length){const e=this._getWritablePackets();this.transport.send(e),this._prevBufferLen=e.length,this.emitReserved("flush")}}_getWritablePackets(){if(!(this._maxPayload&&this.transport.name==="polling"&&this.writeBuffer.length>1))return this.writeBuffer;let t=1;for(let i=0;i<this.writeBuffer.length;i++){const s=this.writeBuffer[i].data;if(s&&(t+=Kt(s)),i>0&&t>this._maxPayload)return this.writeBuffer.slice(0,i);t+=2}return this.writeBuffer}_hasPingExpired(){if(!this._pingTimeoutTime)return!0;const e=Date.now()>this._pingTimeoutTime;return e&&(this._pingTimeoutTime=0,xe(()=>{this._onClose("ping timeout")},this.setTimeoutFn)),e}write(e,t,i){return this._sendPacket("message",e,t,i),this}send(e,t,i){return this._sendPacket("message",e,t,i),this}_sendPacket(e,t,i,s){if(typeof t=="function"&&(s=t,t=void 0),typeof i=="function"&&(s=i,i=null),this.readyState==="closing"||this.readyState==="closed")return;i=i||{},i.compress=i.compress!==!1;const o={type:e,data:t,options:i};this.emitReserved("packetCreate",o),this.writeBuffer.push(o),s&&this.once("flush",s),this.flush()}close(){const e=()=>{this._onClose("forced close"),this.transport.close()},t=()=>{this.off("upgrade",t),this.off("upgradeError",t),e()},i=()=>{this.once("upgrade",t),this.once("upgradeError",t)};return(this.readyState==="opening"||this.readyState==="open")&&(this.readyState="closing",this.writeBuffer.length?this.once("drain",()=>{this.upgrading?i():e()}):this.upgrading?i():e()),this}_onError(e){if(D.priorWebsocketSuccess=!1,this.opts.tryAllTransports&&this.transports.length>1&&this.readyState==="opening")return this.transports.shift(),this._open();this.emitReserved("error",e),this._onClose("transport error",e)}_onClose(e,t){if(this.readyState==="opening"||this.readyState==="open"||this.readyState==="closing"){if(this.clearTimeoutFn(this._pingTimeoutTimer),this.transport.removeAllListeners("close"),this.transport.close(),this.transport.removeAllListeners(),Ae&&(this._beforeunloadEventListener&&removeEventListener("beforeunload",this._beforeunloadEventListener,!1),this._offlineEventListener)){const i=pe.indexOf(this._offlineEventListener);i!==-1&&pe.splice(i,1)}this.readyState="closed",this.id=null,this.emitReserved("close",e,t),this.writeBuffer=[],this._prevBufferLen=0}}}D.protocol=ut;class cn extends D{constructor(){super(...arguments),this._upgrades=[]}onOpen(){if(super.onOpen(),this.readyState==="open"&&this.opts.upgrade)for(let e=0;e<this._upgrades.length;e++)this._probe(this._upgrades[e])}_probe(e){let t=this.createTransport(e),i=!1;D.priorWebsocketSuccess=!1;const s=()=>{i||(t.send([{type:"ping",data:"probe"}]),t.once("packet",h=>{if(!i)if(h.type==="pong"&&h.data==="probe"){if(this.upgrading=!0,this.emitReserved("upgrading",t),!t)return;D.priorWebsocketSuccess=t.name==="websocket",this.transport.pause(()=>{i||this.readyState!=="closed"&&(d(),this.setTransport(t),t.send([{type:"upgrade"}]),this.emitReserved("upgrade",t),t=null,this.upgrading=!1,this.flush())})}else{const u=new Error("probe error");u.transport=t.name,this.emitReserved("upgradeError",u)}}))};function o(){i||(i=!0,d(),t.close(),t=null)}const a=h=>{const u=new Error("probe error: "+h);u.transport=t.name,o(),this.emitReserved("upgradeError",u)};function r(){a("transport closed")}function c(){a("socket closed")}function l(h){t&&h.name!==t.name&&o()}const d=()=>{t.removeListener("open",s),t.removeListener("error",a),t.removeListener("close",r),this.off("close",c),this.off("upgrading",l)};t.once("open",s),t.once("error",a),t.once("close",r),this.once("close",c),this.once("upgrading",l),this._upgrades.indexOf("webtransport")!==-1&&e!=="webtransport"?this.setTimeoutFn(()=>{i||t.open()},200):t.open()}onHandshake(e){this._upgrades=this._filterUpgrades(e.upgrades),super.onHandshake(e)}_filterUpgrades(e){const t=[];for(let i=0;i<e.length;i++)~this.transports.indexOf(e[i])&&t.push(e[i]);return t}}let ln=class extends cn{constructor(e,t={}){const i=typeof e=="object",s=i?{...e}:{...t};(!s.transports||s.transports&&typeof s.transports[0]=="string")&&(s.transports=(s.transports||["polling","websocket","webtransport"]).map(o=>nn[o]).filter(o=>!!o)),super(i?s:e,s)}};function dn(n,e="",t){let i=n;t=t||typeof location<"u"&&location,n==null&&(n=t.protocol+"//"+t.host),typeof n=="string"&&(n.charAt(0)==="/"&&(n.charAt(1)==="/"?n=t.protocol+n:n=t.host+n),/^(https?|wss?):\/\//.test(n)||(typeof t<"u"?n=t.protocol+"//"+n:n="https://"+n),i=Ie(n)),i.port||(/^(http|ws)$/.test(i.protocol)?i.port="80":/^(http|ws)s$/.test(i.protocol)&&(i.port="443")),i.path=i.path||"/";const o=i.host.indexOf(":")!==-1?"["+i.host+"]":i.host;return i.id=i.protocol+"://"+o+":"+i.port+e,i.href=i.protocol+"://"+o+(t&&t.port===i.port?"":":"+i.port),i}const hn=typeof ArrayBuffer=="function",un=n=>typeof ArrayBuffer.isView=="function"?ArrayBuffer.isView(n):n.buffer instanceof ArrayBuffer,_t=Object.prototype.toString,pn=typeof Blob=="function"||typeof Blob<"u"&&_t.call(Blob)==="[object BlobConstructor]",fn=typeof File=="function"||typeof File<"u"&&_t.call(File)==="[object FileConstructor]";function Fe(n){return hn&&(n instanceof ArrayBuffer||un(n))||pn&&n instanceof Blob||fn&&n instanceof File}function fe(n,e){if(!n||typeof n!="object")return!1;if(Array.isArray(n)){for(let t=0,i=n.length;t<i;t++)if(fe(n[t]))return!0;return!1}if(Fe(n))return!0;if(n.toJSON&&typeof n.toJSON=="function"&&arguments.length===1)return fe(n.toJSON(),!0);for(const t in n)if(Object.prototype.hasOwnProperty.call(n,t)&&fe(n[t]))return!0;return!1}function vn(n){const e=[],t=n.data,i=n;return i.data=ve(t,e),i.attachments=e.length,{packet:i,buffers:e}}function ve(n,e,t){if(!n)return n;if(Fe(n)){const i={_placeholder:!0,num:e.length};return e.push(n),i}else if(Array.isArray(n)){const i=new Array(n.length);for(let s=0;s<n.length;s++)i[s]=ve(n[s],e);return i}else if(typeof n=="object"&&!(n instanceof Date)){if(n.toJSON&&typeof n.toJSON=="function"&&!t)return ve(n.toJSON(),e,!0);const i={};for(const s in n)Object.prototype.hasOwnProperty.call(n,s)&&(i[s]=ve(n[s],e));return i}return n}function mn(n,e){return n.data=Me(n.data,e),delete n.attachments,n}function Me(n,e){if(!n)return n;if(n&&n._placeholder===!0){if(typeof n.num=="number"&&n.num>=0&&n.num<e.length)return e[n.num];throw new Error("illegal attachments")}else if(Array.isArray(n))for(let t=0;t<n.length;t++)n[t]=Me(n[t],e);else if(typeof n=="object")for(const t in n)Object.prototype.hasOwnProperty.call(n,t)&&(n[t]=Me(n[t],e));return n}const gn=["connect","connect_error","disconnect","disconnecting","newListener","removeListener"];var p;(function(n){n[n.CONNECT=0]="CONNECT",n[n.DISCONNECT=1]="DISCONNECT",n[n.EVENT=2]="EVENT",n[n.ACK=3]="ACK",n[n.CONNECT_ERROR=4]="CONNECT_ERROR",n[n.BINARY_EVENT=5]="BINARY_EVENT",n[n.BINARY_ACK=6]="BINARY_ACK"})(p||(p={}));class _n{constructor(e){this.replacer=e}encode(e){return(e.type===p.EVENT||e.type===p.ACK)&&fe(e)?this.encodeAsBinary({type:e.type===p.EVENT?p.BINARY_EVENT:p.BINARY_ACK,nsp:e.nsp,data:e.data,id:e.id}):[this.encodeAsString(e)]}encodeAsString(e){let t=""+e.type;return(e.type===p.BINARY_EVENT||e.type===p.BINARY_ACK)&&(t+=e.attachments+"-"),e.nsp&&e.nsp!=="/"&&(t+=e.nsp+","),e.id!=null&&(t+=e.id),e.data!=null&&(t+=JSON.stringify(e.data,this.replacer)),t}encodeAsBinary(e){const t=vn(e),i=this.encodeAsString(t.packet),s=t.buffers;return s.unshift(i),s}}class Ue extends x{constructor(e){super(),this.opts=Object.assign({reviver:void 0,maxAttachments:10},typeof e=="function"?{reviver:e}:e)}add(e){let t;if(typeof e=="string"){if(this.reconstructor)throw new Error("got plaintext data when reconstructing a packet");t=this.decodeString(e);const i=t.type===p.BINARY_EVENT;i||t.type===p.BINARY_ACK?(t.type=i?p.EVENT:p.ACK,this.reconstructor=new bn(t)):super.emitReserved("decoded",t)}else if(Fe(e)||e.base64)if(this.reconstructor)t=this.reconstructor.takeBinaryData(e),t&&(this.reconstructor=null,super.emitReserved("decoded",t));else throw new Error("got binary data when not reconstructing a packet");else throw new Error("Unknown type: "+e)}decodeString(e){let t=0;const i={type:Number(e.charAt(0))};if(p[i.type]===void 0)throw new Error("unknown packet type "+i.type);if(i.type===p.BINARY_EVENT||i.type===p.BINARY_ACK){const o=t+1;for(;e.charAt(++t)!=="-"&&t!=e.length;);const a=e.substring(o,t);if(a!=Number(a)||e.charAt(t)!=="-")throw new Error("Illegal attachments");const r=Number(a);if(!yn(r)||r<1)throw new Error("Illegal attachments");if(r>this.opts.maxAttachments)throw new Error("too many attachments");i.attachments=r}if(e.charAt(t+1)==="/"){const o=t+1;for(;++t&&!(e.charAt(t)===","||t===e.length););i.nsp=e.substring(o,t)}else i.nsp="/";const s=e.charAt(t+1);if(s!==""&&Number(s)==s){const o=t+1;for(;++t;){const a=e.charAt(t);if(a==null||Number(a)!=a){--t;break}if(t===e.length)break}i.id=Number(e.substring(o,t+1))}if(e.charAt(++t)){const o=this.tryParse(e.substr(t));if(Ue.isPayloadValid(i.type,o))i.data=o;else throw new Error("invalid payload")}return i}tryParse(e){try{return JSON.parse(e,this.opts.reviver)}catch{return!1}}static isPayloadValid(e,t){switch(e){case p.CONNECT:return Ye(t);case p.DISCONNECT:return t===void 0;case p.CONNECT_ERROR:return typeof t=="string"||Ye(t);case p.EVENT:case p.BINARY_EVENT:return Array.isArray(t)&&(typeof t[0]=="number"||typeof t[0]=="string"&&gn.indexOf(t[0])===-1);case p.ACK:case p.BINARY_ACK:return Array.isArray(t)}}destroy(){this.reconstructor&&(this.reconstructor.finishedReconstruction(),this.reconstructor=null)}}class bn{constructor(e){this.packet=e,this.buffers=[],this.reconPack=e}takeBinaryData(e){if(this.buffers.push(e),this.buffers.length===this.reconPack.attachments){const t=mn(this.reconPack,this.buffers);return this.finishedReconstruction(),t}return null}finishedReconstruction(){this.reconPack=null,this.buffers=[]}}const yn=Number.isInteger||function(n){return typeof n=="number"&&isFinite(n)&&Math.floor(n)===n};function Ye(n){return Object.prototype.toString.call(n)==="[object Object]"}const kn=Object.freeze(Object.defineProperty({__proto__:null,Decoder:Ue,Encoder:_n,get PacketType(){return p}},Symbol.toStringTag,{value:"Module"}));function q(n,e,t){return n.on(e,t),function(){n.off(e,t)}}const wn=Object.freeze({connect:1,connect_error:1,disconnect:1,disconnecting:1,newListener:1,removeListener:1});class bt extends x{constructor(e,t,i){super(),this.connected=!1,this.recovered=!1,this.receiveBuffer=[],this.sendBuffer=[],this._queue=[],this._queueSeq=0,this.ids=0,this.acks={},this.flags={},this.io=e,this.nsp=t,i&&i.auth&&(this.auth=i.auth),this._opts=Object.assign({},i),this.io._autoConnect&&this.open()}get disconnected(){return!this.connected}subEvents(){if(this.subs)return;const e=this.io;this.subs=[q(e,"open",this.onopen.bind(this)),q(e,"packet",this.onpacket.bind(this)),q(e,"error",this.onerror.bind(this)),q(e,"close",this.onclose.bind(this))]}get active(){return!!this.subs}connect(){return this.connected?this:(this.subEvents(),this.io._reconnecting||this.io.open(),this.io._readyState==="open"&&this.onopen(),this)}open(){return this.connect()}send(...e){return e.unshift("message"),this.emit.apply(this,e),this}emit(e,...t){var i,s,o;if(wn.hasOwnProperty(e))throw new Error('"'+e.toString()+'" is a reserved event name');if(t.unshift(e),this._opts.retries&&!this.flags.fromQueue&&!this.flags.volatile)return this._addToQueue(t),this;const a={type:p.EVENT,data:t};if(a.options={},a.options.compress=this.flags.compress!==!1,typeof t[t.length-1]=="function"){const d=this.ids++,h=t.pop();this._registerAckCallback(d,h),a.id=d}const r=(s=(i=this.io.engine)===null||i===void 0?void 0:i.transport)===null||s===void 0?void 0:s.writable,c=this.connected&&!(!((o=this.io.engine)===null||o===void 0)&&o._hasPingExpired());return this.flags.volatile&&!r||(c?(this.notifyOutgoingListeners(a),this.packet(a)):this.sendBuffer.push(a)),this.flags={},this}_registerAckCallback(e,t){var i;const s=(i=this.flags.timeout)!==null&&i!==void 0?i:this._opts.ackTimeout;if(s===void 0){this.acks[e]=t;return}const o=this.io.setTimeoutFn(()=>{delete this.acks[e];for(let r=0;r<this.sendBuffer.length;r++)this.sendBuffer[r].id===e&&this.sendBuffer.splice(r,1);t.call(this,new Error("operation has timed out"))},s),a=(...r)=>{this.io.clearTimeoutFn(o),t.apply(this,r)};a.withError=!0,this.acks[e]=a}emitWithAck(e,...t){return new Promise((i,s)=>{const o=(a,r)=>a?s(a):i(r);o.withError=!0,t.push(o),this.emit(e,...t)})}_addToQueue(e){let t;typeof e[e.length-1]=="function"&&(t=e.pop());const i={id:this._queueSeq++,tryCount:0,pending:!1,args:e,flags:Object.assign({fromQueue:!0},this.flags)};e.push((s,...o)=>(this._queue[0],s!==null?i.tryCount>this._opts.retries&&(this._queue.shift(),t&&t(s)):(this._queue.shift(),t&&t(null,...o)),i.pending=!1,this._drainQueue())),this._queue.push(i),this._drainQueue()}_drainQueue(e=!1){if(!this.connected||this._queue.length===0)return;const t=this._queue[0];t.pending&&!e||(t.pending=!0,t.tryCount++,this.flags=t.flags,this.emit.apply(this,t.args))}packet(e){e.nsp=this.nsp,this.io._packet(e)}onopen(){typeof this.auth=="function"?this.auth(e=>{this._sendConnectPacket(e)}):this._sendConnectPacket(this.auth)}_sendConnectPacket(e){this.packet({type:p.CONNECT,data:this._pid?Object.assign({pid:this._pid,offset:this._lastOffset},e):e})}onerror(e){this.connected||this.emitReserved("connect_error",e)}onclose(e,t){this.connected=!1,delete this.id,this.emitReserved("disconnect",e,t),this._clearAcks()}_clearAcks(){Object.keys(this.acks).forEach(e=>{if(!this.sendBuffer.some(i=>String(i.id)===e)){const i=this.acks[e];delete this.acks[e],i.withError&&i.call(this,new Error("socket has been disconnected"))}})}onpacket(e){if(e.nsp===this.nsp)switch(e.type){case p.CONNECT:e.data&&e.data.sid?this.onconnect(e.data.sid,e.data.pid):this.emitReserved("connect_error",new Error("It seems you are trying to reach a Socket.IO server in v2.x with a v3.x client, but they are not compatible (more information here: https://socket.io/docs/v3/migrating-from-2-x-to-3-0/)"));break;case p.EVENT:case p.BINARY_EVENT:this.onevent(e);break;case p.ACK:case p.BINARY_ACK:this.onack(e);break;case p.DISCONNECT:this.ondisconnect();break;case p.CONNECT_ERROR:this.destroy();const i=new Error(e.data.message);i.data=e.data.data,this.emitReserved("connect_error",i);break}}onevent(e){const t=e.data||[];e.id!=null&&t.push(this.ack(e.id)),this.connected?this.emitEvent(t):this.receiveBuffer.push(Object.freeze(t))}emitEvent(e){if(this._anyListeners&&this._anyListeners.length){const t=this._anyListeners.slice();for(const i of t)i.apply(this,e)}super.emit.apply(this,e),this._pid&&e.length&&typeof e[e.length-1]=="string"&&(this._lastOffset=e[e.length-1])}ack(e){const t=this;let i=!1;return function(...s){i||(i=!0,t.packet({type:p.ACK,id:e,data:s}))}}onack(e){const t=this.acks[e.id];typeof t=="function"&&(delete this.acks[e.id],t.withError&&e.data.unshift(null),t.apply(this,e.data))}onconnect(e,t){this.id=e,this.recovered=t&&this._pid===t,this._pid=t,this.connected=!0,this.emitBuffered(),this._drainQueue(!0),this.emitReserved("connect")}emitBuffered(){this.receiveBuffer.forEach(e=>this.emitEvent(e)),this.receiveBuffer=[],this.sendBuffer.forEach(e=>{this.notifyOutgoingListeners(e),this.packet(e)}),this.sendBuffer=[]}ondisconnect(){this.destroy(),this.onclose("io server disconnect")}destroy(){this.subs&&(this.subs.forEach(e=>e()),this.subs=void 0),this.io._destroy(this)}disconnect(){return this.connected&&this.packet({type:p.DISCONNECT}),this.destroy(),this.connected&&this.onclose("io client disconnect"),this}close(){return this.disconnect()}compress(e){return this.flags.compress=e,this}get volatile(){return this.flags.volatile=!0,this}timeout(e){return this.flags.timeout=e,this}onAny(e){return this._anyListeners=this._anyListeners||[],this._anyListeners.push(e),this}prependAny(e){return this._anyListeners=this._anyListeners||[],this._anyListeners.unshift(e),this}offAny(e){if(!this._anyListeners)return this;if(e){const t=this._anyListeners;for(let i=0;i<t.length;i++)if(e===t[i])return t.splice(i,1),this}else this._anyListeners=[];return this}listenersAny(){return this._anyListeners||[]}onAnyOutgoing(e){return this._anyOutgoingListeners=this._anyOutgoingListeners||[],this._anyOutgoingListeners.push(e),this}prependAnyOutgoing(e){return this._anyOutgoingListeners=this._anyOutgoingListeners||[],this._anyOutgoingListeners.unshift(e),this}offAnyOutgoing(e){if(!this._anyOutgoingListeners)return this;if(e){const t=this._anyOutgoingListeners;for(let i=0;i<t.length;i++)if(e===t[i])return t.splice(i,1),this}else this._anyOutgoingListeners=[];return this}listenersAnyOutgoing(){return this._anyOutgoingListeners||[]}notifyOutgoingListeners(e){if(this._anyOutgoingListeners&&this._anyOutgoingListeners.length){const t=this._anyOutgoingListeners.slice();for(const i of t)i.apply(this,e.data)}}}function Q(n){n=n||{},this.ms=n.min||100,this.max=n.max||1e4,this.factor=n.factor||2,this.jitter=n.jitter>0&&n.jitter<=1?n.jitter:0,this.attempts=0}Q.prototype.duration=function(){var n=this.ms*Math.pow(this.factor,this.attempts++);if(this.jitter){var e=Math.random(),t=Math.floor(e*this.jitter*n);n=Math.floor(e*10)&1?n+t:n-t}return Math.min(n,this.max)|0};Q.prototype.reset=function(){this.attempts=0};Q.prototype.setMin=function(n){this.ms=n};Q.prototype.setMax=function(n){this.max=n};Q.prototype.setJitter=function(n){this.jitter=n};class He extends x{constructor(e,t){var i;super(),this.nsps={},this.subs=[],e&&typeof e=="object"&&(t=e,e=void 0),t=t||{},t.path=t.path||"/socket.io",this.opts=t,Te(this,t),this.reconnection(t.reconnection!==!1),this.reconnectionAttempts(t.reconnectionAttempts||1/0),this.reconnectionDelay(t.reconnectionDelay||1e3),this.reconnectionDelayMax(t.reconnectionDelayMax||5e3),this.randomizationFactor((i=t.randomizationFactor)!==null&&i!==void 0?i:.5),this.backoff=new Q({min:this.reconnectionDelay(),max:this.reconnectionDelayMax(),jitter:this.randomizationFactor()}),this.timeout(t.timeout==null?2e4:t.timeout),this._readyState="closed",this.uri=e;const s=t.parser||kn;this.encoder=new s.Encoder,this.decoder=new s.Decoder,this._autoConnect=t.autoConnect!==!1,this._autoConnect&&this.open()}reconnection(e){return arguments.length?(this._reconnection=!!e,e||(this.skipReconnect=!0),this):this._reconnection}reconnectionAttempts(e){return e===void 0?this._reconnectionAttempts:(this._reconnectionAttempts=e,this)}reconnectionDelay(e){var t;return e===void 0?this._reconnectionDelay:(this._reconnectionDelay=e,(t=this.backoff)===null||t===void 0||t.setMin(e),this)}randomizationFactor(e){var t;return e===void 0?this._randomizationFactor:(this._randomizationFactor=e,(t=this.backoff)===null||t===void 0||t.setJitter(e),this)}reconnectionDelayMax(e){var t;return e===void 0?this._reconnectionDelayMax:(this._reconnectionDelayMax=e,(t=this.backoff)===null||t===void 0||t.setMax(e),this)}timeout(e){return arguments.length?(this._timeout=e,this):this._timeout}maybeReconnectOnOpen(){!this._reconnecting&&this._reconnection&&this.backoff.attempts===0&&this.reconnect()}open(e){if(~this._readyState.indexOf("open"))return this;this.engine=new ln(this.uri,this.opts);const t=this.engine,i=this;this._readyState="opening",this.skipReconnect=!1;const s=q(t,"open",function(){i.onopen(),e&&e()}),o=r=>{this.cleanup(),this._readyState="closed",this.emitReserved("error",r),e?e(r):this.maybeReconnectOnOpen()},a=q(t,"error",o);if(this._timeout!==!1){const r=this._timeout,c=this.setTimeoutFn(()=>{s(),o(new Error("timeout")),t.close()},r);this.opts.autoUnref&&c.unref(),this.subs.push(()=>{this.clearTimeoutFn(c)})}return this.subs.push(s),this.subs.push(a),this}connect(e){return this.open(e)}onopen(){this.cleanup(),this._readyState="open",this.emitReserved("open");const e=this.engine;this.subs.push(q(e,"ping",this.onping.bind(this)),q(e,"data",this.ondata.bind(this)),q(e,"error",this.onerror.bind(this)),q(e,"close",this.onclose.bind(this)),q(this.decoder,"decoded",this.ondecoded.bind(this)))}onping(){this.emitReserved("ping")}ondata(e){try{this.decoder.add(e)}catch(t){this.onclose("parse error",t)}}ondecoded(e){xe(()=>{this.emitReserved("packet",e)},this.setTimeoutFn)}onerror(e){this.emitReserved("error",e)}socket(e,t){let i=this.nsps[e];return i?this._autoConnect&&!i.active&&i.connect():(i=new bt(this,e,t),this.nsps[e]=i),i}_destroy(e){const t=Object.keys(this.nsps);for(const i of t)if(this.nsps[i].active)return;this._close()}_packet(e){const t=this.encoder.encode(e);for(let i=0;i<t.length;i++)this.engine.write(t[i],e.options)}cleanup(){this.subs.forEach(e=>e()),this.subs.length=0,this.decoder.destroy()}_close(){this.skipReconnect=!0,this._reconnecting=!1,this.onclose("forced close")}disconnect(){return this._close()}onclose(e,t){var i;this.cleanup(),(i=this.engine)===null||i===void 0||i.close(),this.backoff.reset(),this._readyState="closed",this.emitReserved("close",e,t),this._reconnection&&!this.skipReconnect&&this.reconnect()}reconnect(){if(this._reconnecting||this.skipReconnect)return this;const e=this;if(this.backoff.attempts>=this._reconnectionAttempts)this.backoff.reset(),this.emitReserved("reconnect_failed"),this._reconnecting=!1;else{const t=this.backoff.duration();this._reconnecting=!0;const i=this.setTimeoutFn(()=>{e.skipReconnect||(this.emitReserved("reconnect_attempt",e.backoff.attempts),!e.skipReconnect&&e.open(s=>{s?(e._reconnecting=!1,e.reconnect(),this.emitReserved("reconnect_error",s)):e.onreconnect()}))},t);this.opts.autoUnref&&i.unref(),this.subs.push(()=>{this.clearTimeoutFn(i)})}}onreconnect(){const e=this.backoff.attempts;this._reconnecting=!1,this.backoff.reset(),this.emitReserved("reconnect",e)}}const ee={};function me(n,e){typeof n=="object"&&(e=n,n=void 0),e=e||{};const t=dn(n,e.path||"/socket.io"),i=t.source,s=t.id,o=t.path,a=ee[s]&&o in ee[s].nsps,r=e.forceNew||e["force new connection"]||e.multiplex===!1||a;let c;return r?c=new He(i,e):(ee[s]||(ee[s]=new He(i,e)),c=ee[s]),t.query&&!e.query&&(e.query=t.queryKey),c.socket(t.path,e)}Object.assign(me,{Manager:He,Socket:bt,io:me,connect:me});let le=null;function yt(){return le||(le=me(se||"/",{auth:{token:w.token()},reconnection:!0,reconnectionDelay:1500,reconnectionDelayMax:1e4}),le)}function xn(n,e,t){const i=yt();i.emit("join:conv",n);const s=a=>{((a==null?void 0:a.conversationId)===n||!(a!=null&&a.conversationId))&&e(a)},o=a=>{(a==null?void 0:a.convId)===n&&t&&t(a.isTyping)};return i.on("chat:message",s),i.on("chat:ai-typing",o),()=>{i.emit("leave:conv",n),i.off("chat:message",s),i.off("chat:ai-typing",o)}}function Tn(n){const e=yt();return e.on("chat:conv-updated",n),()=>e.off("chat:conv-updated",n)}const $=n=>String(n??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),ge=n=>Number(String(n??"").replace(/[^\d]/g,""))||0,_e=n=>String(n||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();let P=null,we=[],f=null,qe=null,Re=null,W=null,be=null;function Cn(){const n=document.getElementById("panel-order"),e=[...n.querySelectorAll("select:not([id])")],[t,i,s,o,a,r,c]=e,l=n.querySelector('input[placeholder="Tìm sản phẩm"]'),d=n.querySelector('input[placeholder="Tìm quà tặng"]'),h=n.querySelector('input[placeholder*="địa chỉ chi tiết"]');return{panel:n,status:t,staff:i,province:s,ward:o,source:a,type:r,kho:c,searchSp:l,searchGift:d,addr:h}}function de(n,e,{value:t,label:i,placeholder:s}){n.innerHTML=(s?`<option value="">${$(s)}</option>`:"")+e.map(o=>`<option value="${$(o[t])}">${$(o[i])}</option>`).join("")}function Ze(n,{isGift:e}){const t=n.parentElement;t.style.position="relative";const i=document.createElement("div");i.style.cssText=`position:absolute; left:0; right:0; top:100%; z-index:60; background:#fff;
    border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 10px 24px rgba(15,23,42,.12);
    max-height:250px; overflow:auto; display:none;`,t.appendChild(i);const s=()=>{i.style.display="none"};document.addEventListener("click",a=>{t.contains(a.target)||s()});let o;n.addEventListener("input",()=>{clearTimeout(o),o=setTimeout(()=>{const a=_e(n.value.trim());if(!a){s();return}const r=we.filter(c=>_e(c.name).includes(a)||_e(c.code).includes(a)).slice(0,12);i.innerHTML=r.length?r.map(c=>`
        <div data-pid="${c.id}" style="padding:9px 12px; border-bottom:1px solid #f8fafc; cursor:pointer;">
          <div style="font-size:12.5px; font-weight:600; color:#0f172a;">${$(c.name)}</div>
          <div style="font-size:11px; color:#64748b;">${$(c.code)} · ${new Intl.NumberFormat("vi-VN").format(c.price)}đ
            · Tồn ${c.inventory}${c.inventory<=0?" ⚠️ hết hàng":""}</div>
        </div>`).join(""):'<div style="padding:10px 12px; font-size:12px; color:#94a3b8;">Không tìm thấy sản phẩm.</div>',i.style.display="block"},250)}),i.addEventListener("click",a=>{const r=a.target.closest("[data-pid]");if(!r)return;const c=we.find(l=>String(l.id)===r.dataset.pid);c&&En(c,e),n.value="",s()})}function En(n,e){var s;const t=document.getElementById("ofProdList");if(t.querySelector(`.op-item[data-code="${CSS.escape(n.code)}"]${e?"[data-gift]":":not([data-gift])"}`)){alert("Sản phẩm này đã có trong đơn.");return}const i=document.createElement("div");i.className="op-item"+(e?" op-item--gift":""),i.dataset.gia=e?"0":String(n.price||0),i.dataset.kl=String(n.weight||0),i.dataset.ton=String(n.inventory||0),i.dataset.code=n.code,i.dataset.name=n.name,i.dataset.price=String(n.price||0),e&&(i.dataset.gift="1"),i.innerHTML=`
    <div class="op-item__top">
      <span class="op-item__code">${$(n.code)}</span>
      ${e?'<span class="op-gift-tag">🎁 Quà tặng</span>':""}
      <button type="button" class="op-item__del" title="Xoá sản phẩm">✕</button>
    </div>
    <div class="op-item__name">${$(n.name)}</div>
    <div class="op-item__row">
      <span class="op-item__kl">${n.weight||0}g</span>
      <div class="op-qty">
        <button type="button" data-d="-1">−</button>
        <input inputmode="numeric" value="1">
        <button type="button" data-d="1">+</button>
      </div>
      <b class="op-item__sum">${e?"0đ":new Intl.NumberFormat("vi-VN").format(n.price)+"đ"}</b>
    </div>`,t.appendChild(i),(s=window.ofRecalcProducts)==null||s.call(window)}function Sn(){return[...document.querySelectorAll("#ofProdList .op-item")].map(n=>{var e;return{productCode:n.dataset.code,productName:n.dataset.name,quantity:Math.max(1,ge((e=n.querySelector(".op-qty input"))==null?void 0:e.value)||1),unitPrice:Number(n.dataset.price)||0,isGift:!!n.dataset.gift}})}function Ln(n){const e=_e(n);return e.includes("j&t")||e.includes("jt")?"jt_express":e.includes("viettel")?"viettel_post":e.includes("vnpost")||e.includes("buu dien")?"vnpost":"other"}async function Nn(n){var h,u,m,k,B,T,L,V,J,v,C;const e=Sn();if(!e.length){alert("Chưa có sản phẩm nào trong đơn.");return}if(!e.some(E=>!E.isGift)){alert("Đơn chỉ toàn quà tặng — cần ít nhất 1 sản phẩm bán.");return}const t=(((h=document.getElementById("ofPhone"))==null?void 0:h.value)||(be==null?void 0:be.phone)||"").trim();if(!t){alert("Khách chưa có số điện thoại — nhập SĐT ở ô trên nút Đặt hàng."),(u=document.getElementById("ofPhone"))==null||u.focus();return}const i=((m=f.province.selectedOptions[0])==null?void 0:m.text)||"",s=((k=f.ward.selectedOptions[0])==null?void 0:k.text)||"",o=((B=f.addr)==null?void 0:B.value.trim())||"",a=[o,s!=="Chọn phường/xã"?s:"",i!=="-- Chọn tỉnh/thành --"?i:""].filter(Boolean).join(", ");if(!a){alert("Chưa có địa chỉ nhận hàng.");return}const r=e.reduce((E,Y)=>E+(Y.isGift?0:Y.unitPrice*Y.quantity),0),c=Math.min(100,ge(document.getElementById("ofDiscount").value)),l=((T=W.contact)==null?void 0:T.crmName)||((L=W.contact)==null?void 0:L.fullName)||W.displayName||"Khách hàng",d={conversationId:W.id,contactId:((V=W.contact)==null?void 0:V.id)||void 0,customerName:l,customerPhone:t,shippingAddress:a,city:i||void 0,items:e,discountAmount:Math.round(r*c/100),shippingFee:ge(document.getElementById("ofShipCost").value),paymentMethod:"cod",depositAmount:ge(document.getElementById("ofTransfer").value),orderStatusId:Number(f.status.value)||void 0,warehouseId:Number(f.kho.value)||void 0,provinceId:Number(f.province.value)||void 0,provinceName:i||void 0,wardId:Number(f.ward.value)||void 0,wardName:s||void 0,addressDetail:o||void 0,orderType:f.type.value||void 0,orderSource:f.source.value||void 0,selfShipping:document.getElementById("ofSelfShip").checked,isExchange:document.getElementById("ofReturnCheck").checked,shippingProvider:Ln(((J=document.getElementById("ofShipUnit").selectedOptions[0])==null?void 0:J.text)||""),notes:document.getElementById("ofOrderNote").value.trim()||void 0,requestId:Re};n.disabled=!0,n.textContent="Đang tạo đơn…";try{const E=await g.post("/api/v1/orders/create",d),Y=new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND"}).format(E.total_amount||0);alert(E.replayed?`ℹ️ Đơn này đã tạo trước đó [${E.order_code}] — không tạo trùng.`:`🎉 LÊN ĐƠN THÀNH CÔNG [${E.order_code}]

Tổng: ${Y}
${E.fm_saved?"✓ Đã vào CRM & FM":"⚠ Đã vào CRM, FM sẽ tự đồng bộ lại"}`),document.querySelectorAll("#ofProdList .op-item").forEach(Ct=>Ct.remove()),(v=window.ofRecalcProducts)==null||v.call(window),Re=crypto.randomUUID(),(C=window.navBack)==null||C.call(window,"view-detail")}catch(E){alert(`❌ KHÔNG TẠO ĐƯỢC ĐƠN

`+E.message+`

Bấm lại — hệ thống không tạo đơn trùng.`)}finally{n.disabled=!1,n.textContent="🛒 Đặt hàng"}}async function et(n,e){var r,c,l,d,h;if(W=n,be=e,qe===n.id)return;if(qe=n.id,Re=crypto.randomUUID(),f=Cn(),!P)try{P=await g.get("/api/v1/orders/form-lookups")}catch(u){alert("Không tải được dữ liệu form đơn: "+u.message);return}de(f.status,P.statuses,{value:"id",label:"label"}),f.status.value=String(((r=P.statuses.find(u=>u.label==="Chờ xử lý"))==null?void 0:r.id)??((c=P.statuses[0])==null?void 0:c.id)),de(f.province,P.provinces,{value:"id",label:"name",placeholder:"-- Chọn tỉnh/thành --"}),de(f.kho,P.warehouses,{value:"id",label:"name"});const t=w.user();f.staff.innerHTML=`<option>${$((t==null?void 0:t.fullName)||"Theo tài khoản đăng nhập")}</option>`,f.staff.disabled=!0,f.staff.title="Người lên đơn tự ghi theo tài khoản đang đăng nhập";const i=document.getElementById("ofPoints");i&&(i.disabled=!0,i.value="",i.placeholder="Tạm khoá",i.title="Tính năng tiêu điểm đang tạm dừng"),f.ward.innerHTML='<option value="">Chọn tỉnh trước</option>',f.province.addEventListener("change",async()=>{f.ward.innerHTML='<option value="">Đang tải…</option>';try{const u=await g.get(`/api/v1/orders/wards?provinceId=${f.province.value}`);de(f.ward,u.wards||[],{value:"id",label:"name",placeholder:"Chọn phường/xã"})}catch{f.ward.innerHTML='<option value="">Không tải được</option>'}});async function s(){try{we=(await g.get(`/api/v1/orders/catalog?warehouseId=${f.kho.value}`)).products||[]}catch{we=[]}}if(f.kho.addEventListener("change",s),f.kho.value=String(((l=P.warehouses[0])==null?void 0:l.id)??""),await s(),Ze(f.searchSp,{isGift:!1}),Ze(f.searchGift,{isGift:!0}),document.querySelectorAll("#ofProdList .op-item").forEach(u=>u.remove()),(d=window.ofRecalcProducts)==null||d.call(window),!(e!=null&&e.phone)&&!document.getElementById("ofPhone")){const u=document.createElement("div");u.className="of__group",u.innerHTML=`
      <label class="of__label">📞 SĐT khách (bắt buộc — khách chưa có số)</label>
      <input class="of__input" id="ofPhone" inputmode="tel" placeholder="09xxxxxxxx">`,document.getElementById("ofSubmit").closest(".of__footer, div").before(u)}(h=e==null?void 0:e.crm)!=null&&h.address&&f.addr&&!f.addr.value&&(f.addr.value=e.crm.address);const o=document.getElementById("ofSubmit"),a=o.cloneNode(!0);o.replaceWith(a),a.addEventListener("click",()=>Nn(a))}function Bn(){qe=null}const b=n=>String(n??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),ye=n=>n?n.startsWith("http")?n:se+n:"",In={"sd-images":"image","sd-content":"content","sd-video":"video"};let Oe=null;const tt=["linear-gradient(135deg,#dcfce7,#bbf7d0)","linear-gradient(135deg,#e0f2fe,#bae6fd)","linear-gradient(135deg,#fef3c7,#fde68a)","linear-gradient(135deg,#f3e8ff,#e9d5ff)"];async function nt(n){if(Oe!==n){Oe=n;for(const[e,t]of Object.entries(In)){const i=document.getElementById(e);if(!i)continue;let s=[];try{s=(await g.get(`/api/v1/library?kind=${t}`)).groups||[]}catch{}i.querySelectorAll(".sd__group, .sd__grid, .sd-content, .sd__empty-real").forEach(l=>l.remove());const o=i.querySelector(".sd__send-wrap");let a=0,r="";if(t==="content")r=s.flatMap(d=>d.items).map(d=>`
        <div class="sd-content" style="border:1px solid #f1f5f9; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:5px;">
            <div style="flex:1; min-width:0; font-size:12.5px; font-weight:700; color:#1e293b;">${b(d.title)}</div>
            <button type="button" class="sd-copy" style="border:1px solid #e2e8f0; background:#fff; color:#475569;
              font-size:11px; font-weight:600; padding:4px 9px; border-radius:6px;">📋 Copy</button>
          </div>
          <div class="sd-copy-text" style="font-size:12px; color:#475569; line-height:1.55; white-space:pre-line;
            max-height:110px; overflow:hidden;">${b(d.text||"")}</div>
        </div>`).join("")||'<div class="sd__empty-real" style="text-align:center; color:#94a3b8; font-size:12.5px; padding:20px 0;">Chưa có bài nào được duyệt.</div>';else{for(const l of s){r+=`<div class="sd__group">📁 ${b(l.name)}</div><div class="sd__grid">`;for(const d of l.items){const h=ye(d.url);r+=`
            <label class="sd-tile${h?" sd-tile--img":""}" style="background:${tt[a++%tt.length]}; overflow:hidden; position:relative;">
              <input type="checkbox" data-id="${b(d.id)}" data-name="${b(d.title)}" data-code="${b(d.code||"")}">
              ${h?`<img src="${b(h)}" alt="" referrerpolicy="no-referrer"
                 style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                 onerror="this.remove()">`:""}
              <span class="sd-tile__emoji" ${h?'style="display:none"':""}>${t==="video"?"🎬":"🍵"}</span>
              <span class="sd-tile__name" style="${h?"position:absolute; left:4px; right:4px; bottom:4px; background:rgba(0,0,0,.55); color:#fff; border-radius:4px; padding:1px 4px; z-index:1;":""}">${b(d.title)}</span>
            </label>`}r+="</div>"}r||(r='<div class="sd__empty-real" style="text-align:center; color:#94a3b8; font-size:12.5px; padding:20px 0;">Chưa có tài liệu nào.</div>')}o?o.insertAdjacentHTML("beforebegin",r):i.insertAdjacentHTML("beforeend",r),i.querySelectorAll(".sd-copy").forEach(l=>{l.onclick=async()=>{const d=l.closest(".sd-content").querySelector(".sd-copy-text").textContent;try{await navigator.clipboard.writeText(d),l.textContent="✓ Đã copy"}catch{alert("Trình duyệt chặn copy — bôi đen thủ công giúp em.")}setTimeout(()=>{l.textContent="📋 Copy"},1500)}});const c=i.querySelector(".sd__send-btn");if(c){const l=c.cloneNode(!0);c.replaceWith(l),l.onclick=async()=>{const d=X();if(!d){alert("Mở một hội thoại trước đã.");return}const h=[...i.querySelectorAll(".sd-tile input:checked")].map(u=>u.dataset.id);if(h.length){l.disabled=!0,l.textContent="Đang gửi…";try{const u=await g.post("/api/v1/library/send",{conversationId:d.id,itemIds:h}),m=(u.skipped||[]).length;l.textContent=m?`✓ Gửi ${(u.created||[]).length}, bỏ qua ${m}`:`✓ Đã gửi ${(u.created||[]).length}`,i.querySelectorAll(".sd-tile input:checked").forEach(k=>{k.checked=!1})}catch(u){alert("Không gửi được: "+u.message),l.textContent="📤 Gửi vào chat (0)"}finally{l.disabled=!1,setTimeout(()=>{l.textContent="📤 Gửi vào chat (0)",l.disabled=!0},1800)}}}}}}}function An(){Oe=null}const Mn={"lib-media":"media","lib-files":"file","lib-links":"link"};let Pe=null;function Hn(n){const e=new Date(n);return isNaN(e)?"Không rõ ngày":`Ngày ${e.getDate()} Tháng ${e.getMonth()+1}`}async function qn(){const n=X();if(!(!n||Pe===n.id)){Pe=n.id;for(const[e,t]of Object.entries(Mn)){const i=document.getElementById(e);if(i){i.innerHTML='<div style="text-align:center; color:#94a3b8; font-size:12.5px; padding:22px 0;">Đang tải…</div>';try{const o=(await g.get(`/api/v1/orders/conversation-library?conversationId=${encodeURIComponent(n.id)}&kind=${t}`)).groups||[];if(!o.length){i.innerHTML='<div style="text-align:center; color:#94a3b8; font-size:12.5px; padding:22px 0;">Chưa có gì trong mục này.</div>';continue}i.innerHTML=o.map(a=>{const r=`<div class="lib__date" style="font-size:12px; font-weight:700; color:#334155; margin:12px 0 6px;">${b(Hn(a.date))}</div>`;return t==="media"?r+'<div class="lib__grid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">'+a.items.map(c=>`
              <a class="lib__tile" href="${b(ye(c.url))}" target="_blank" rel="noreferrer"
                 style="aspect-ratio:1; border-radius:8px; overflow:hidden; position:relative; background:#f1f5f9; display:flex; align-items:center; justify-content:center;">
                <img src="${b(ye(c.url))}" alt="" referrerpolicy="no-referrer"
                     style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" onerror="this.remove()">
                <span>🖼️</span>
              </a>`).join("")+"</div>":r+a.items.map(c=>`
          <a href="${b(ye(c.url))}" target="_blank" rel="noreferrer"
             style="display:flex; gap:9px; align-items:center; padding:9px 10px; border:1px solid #f1f5f9;
             border-radius:10px; margin-bottom:6px; text-decoration:none;">
            <span>${t==="file"?"📄":"🔗"}</span>
            <span style="min-width:0;">
              <span style="display:block; font-size:12.5px; font-weight:600; color:#0f172a; overflow:hidden;
                text-overflow:ellipsis; white-space:nowrap;">${b(c.title||c.url)}</span>
              <span style="display:block; font-size:11px; color:#94a3b8;">${b(c.sender||"")}</span>
            </span>
          </a>`).join("")}).join("")}catch(s){i.innerHTML=`<div style="color:#b91c1c; font-size:12.5px; padding:14px;">${b(s.message)}</div>`}}}}}function Rn(){Pe=null}function On(){const n=document.getElementById("btnAiAnalyze");if(!n)return;const e=n.cloneNode(!0);n.replaceWith(e),e.addEventListener("click",async()=>{const t=X();if(!t){alert("Mở một hội thoại trước đã.");return}const i=document.getElementById("aiModalBg"),s=document.getElementById("aiLoading"),o=document.getElementById("aiResult"),a=document.getElementById("btnAiToNote");i.classList.add("open"),s.hidden=!1,o.hidden=!0,a.disabled=!0;try{const r=await g.post("/api/v1/ai/customer-360",{conversationId:t.id}),c=(l,d,h)=>`
        <div class="ai-block"><div class="ai-block__title">${l} ${d}</div>${h}</div>`;o.innerHTML=(r.aiAvailable?"":`<div style="background:#fef3c7; border:1px solid #fcd34d; border-radius:8px;
            padding:8px 10px; font-size:11.5px; color:#92400e; margin-bottom:10px;">
            Phần AI chưa chạy được — chân dung bên dưới vẫn đúng vì lấy từ dữ liệu CRM thật.</div>`)+c("👤","Chân dung khách hàng",`<ul style="margin:0; padding-left:17px;">${(r.portrait||[]).map(l=>`<li style="margin-bottom:3px;">${b(l)}</li>`).join("")}</ul>`)+(r.summary?c("💬","Tóm tắt hội thoại",b(r.summary)):"")+(r.opportunity?c("🎯","Cơ hội",b(r.opportunity)):"")+((r.actions||[]).length?c("✅","Đề xuất hành động",`<ol style="margin:0; padding-left:19px;">${r.actions.map(l=>`<li style="margin-bottom:4px;">${b(l)}</li>`).join("")}</ol>`):"")+`<div class="ai-modal__time" id="aiTime">Phân tích lúc: ${new Date(r.generatedAt||Date.now()).toLocaleString("vi-VN")}${r.fromCache?" (dùng lại kết quả gần đây)":""}</div>`,s.hidden=!0,o.hidden=!1,r.aiAvailable&&(r.summary||(r.actions||[]).length)&&(a.disabled=!1,a.onclick=async()=>{var l;a.disabled=!0;try{await g.post("/api/v1/notes",{conversationId:t.id,contactId:((l=t.contact)==null?void 0:l.id)||void 0,content:`[Customer 360]
${r.summary||""}

Cơ hội: ${r.opportunity||"—"}

Hành động:
${(r.actions||[]).map((d,h)=>`${h+1}. ${d}`).join(`
`)}`}),a.textContent="✓ Đã lưu vào ghi chú"}catch(d){alert("Không lưu được: "+d.message),a.disabled=!1}})}catch(r){s.hidden=!0,o.hidden=!1,o.innerHTML=`<div style="color:#b91c1c; font-size:13px;">${b(r.message)}</div>`}})}function kt(n){document.querySelectorAll(".cmm-ai").forEach(e=>e.classList.toggle("cmm-ai--active",e.dataset.ai===(n||"manual")))}function Pn(){document.querySelectorAll(".cmm-ai").forEach(e=>{e.addEventListener("click",async()=>{const t=X();if(t)try{await g.patch(`/api/v1/conversations/${t.id}/ai-mode`,{aiMode:e.dataset.ai}),t.aiMode=e.dataset.ai}catch(i){alert("Không đổi được chế độ AI: "+i.message),kt(t.aiMode)}})});const n=document.getElementById("btnDeleteConv");if(n){const e=n.cloneNode(!0);n.replaceWith(e),e.addEventListener("click",async()=>{var s,o;document.getElementById("chatMoreMenu").hidden=!0;const t=X();if(!t)return;const i=((s=t.contact)==null?void 0:s.fullName)||t.displayName||"hội thoại này";if(confirm(`Xóa toàn bộ hội thoại với "${i}"?
Hành động này không thể hoàn tác.`))try{await g.del(`/api/v1/conversations/${t.id}`),alert("Đã xóa hội thoại."),(o=window.navBack)==null||o.call(window,"view-chat")}catch(a){alert(a.message)}})}}function Dn(){const n=[...document.querySelectorAll("#view-chat .tool-chip")].find(t=>t.textContent.trim()==="AI Gợi ý");if(!n)return;const e=n.cloneNode(!0);n.replaceWith(e),e.addEventListener("click",async()=>{var s;const t=X();if(!t)return;(s=document.getElementById("suggestSheet"))==null||s.remove();const i=document.createElement("div");i.id="suggestSheet",i.style.cssText=`position:fixed; left:0; right:0; bottom:0; z-index:400; background:#fff;
      border-radius:16px 16px 0 0; box-shadow:0 -10px 30px rgba(15,23,42,.18); padding:14px 16px 22px;
      max-height:60vh; overflow:auto;`,i.innerHTML=`<div style="font-size:13.5px; font-weight:800; color:#0f172a; margin-bottom:10px;">
        💡 AI gợi ý trả lời <span style="float:right; cursor:pointer; color:#94a3b8;" id="sgClose">✕</span></div>
      <div id="sgBody" style="color:#94a3b8; font-size:12.5px;">Đang soạn gợi ý…</div>`,document.body.appendChild(i),i.querySelector("#sgClose").onclick=()=>i.remove();try{const o=await g.post("/api/v1/ai/suggest",{conversationId:t.id}),a={concise:"Ngắn gọn",friendly:"Thân thiện",persuasive:"Thuyết phục",detailed:"Chi tiết",professional:"Chuyên nghiệp"};i.querySelector("#sgBody").innerHTML=(o.suggestions||[]).map(r=>`
        <button type="button" data-text="${b(r.text)}" style="display:block; width:100%; text-align:left;
          border:1px solid #e2e8f0; background:#f8fafc; border-radius:10px; padding:10px 12px;
          margin-bottom:8px; font-size:12.5px; color:#334155; line-height:1.5;">
          <b style="color:#0D6838;">${b(a[r.tone]||r.tone||"Gợi ý")}</b><br>${b(r.text)}
        </button>`).join("")||"<div>AI chưa soạn được gợi ý cho hội thoại này.</div>",i.querySelectorAll("[data-text]").forEach(r=>{r.onclick=()=>{const c=document.getElementById("chatInput");c&&(c.value=r.dataset.text,c.focus()),i.remove()}})}catch(o){i.querySelector("#sgBody").innerHTML=`<div style="color:#b91c1c;">${b(o.message)}</div>`}})}function $n(){var n;On(),Pn(),Dn(),(n=document.getElementById("btnChatLibrary"))==null||n.addEventListener("click",qn)}const j=n=>String(n??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]);let N=null,De=null;function Vn(n){N=n}function ke(n){if(!n)return"—";const e=new Date(n);return isNaN(e)?"—":e.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"})}function Kn(n){return n==null?"—":new Intl.NumberFormat("vi-VN").format(n)+"đ"}function I(n,e,t,i=".crm-field"){const s=[...document.querySelectorAll(`${n} ${i}`)].find(o=>{var a;return((a=o.querySelector("span"))==null?void 0:a.textContent.trim())===e});s&&(s.querySelector("b").textContent=t??"—")}async function it(){var l,d,h,u;if(!N||De===N.id)return;De=N.id;const n=((l=N.contact)==null?void 0:l.crmName)||((d=N.contact)==null?void 0:d.fullName)||N.displayName||"Không tên",e=document.querySelector("#view-detail .appbar__title");e&&(e.textContent=n);const t=e==null?void 0:e.nextElementSibling,i=document.querySelector("#view-detail .chat-peer__avatar");if(i){const m=n.trim().split(/\s+/);i.textContent=(m.length>1?m[0][0]+m[m.length-1][0]:m[0].slice(0,2)).toUpperCase()}let s=null;try{s=await g.get(`/api/v1/orders/customer-profile?conversationId=${encodeURIComponent(N.id)}`)}catch(m){t&&(t.textContent=m.status===400?"Chưa có SĐT — chưa nối được hồ sơ CRM":"Không tải được hồ sơ: "+m.message),document.querySelectorAll("#panel-info .crm-stat b").forEach(k=>{k.textContent="—"}),document.querySelectorAll("#panel-info .crm-field b").forEach(k=>{k.textContent="—"}),document.querySelectorAll("#panel-info .info-row .val").forEach(k=>{k.textContent="Chưa có"}),et(N,null),nt(N.id),$e();return}const o=s.crm||{};t&&(t.textContent=`${o.customer_code?o.customer_code+" · ":""}SĐT: ${s.phone||"—"}`),I("#panel-info","Lịch bán hàng",ke(o.next_sales_at),".crm-stat"),I("#panel-info","Lịch chăm sóc",ke(o.next_care_at),".crm-stat"),I("#panel-info","Số đơn",String(o.order_count??((h=s.orders)==null?void 0:h.length)??0),".crm-stat");const a=(o.profile_note||"").split(`
`).filter(m=>/ngày \d/.test(m)).length;I("#panel-info","Ghi chú",String(a),".crm-stat"),I("#panel-info","Mã khách hàng",o.customer_code),I("#panel-info","Số điện thoại",s.phone),I("#panel-info","SĐT liên hệ khác",o.phone2),I("#panel-info","Người phụ trách",o.staff_in_charge),I("#panel-info","Điểm",String(o.diem??0)),I("#panel-info","Nghề nghiệp",o.occupation),I("#panel-info","Nguồn khách hàng",o.referral_source||((u=N.contact)==null?void 0:u.source)),I("#panel-info","Địa chỉ",o.address),I("#panel-info","Địa chỉ 2",o.address2);const r=[...document.querySelectorAll("#panel-info .info-row")],c=(m,k)=>{const B=r.find(T=>{var L;return((L=T.querySelector(".lbl"))==null?void 0:L.textContent.trim())===m});B&&(B.querySelector(".val").textContent=k||"Chưa có")};c("Thích dùng hàng",o.thich_dung_hang),c("Ngày sinh nhật",o.birthday?ke(o.birthday):""),c("Bạn bè Zalo",""),I("#panel-info","Điểm",`${o.diem??0} · GMV ${Kn(o.gmv_total)}`),et(N,s),nt(N.id),$e()}async function $e(){const n=document.getElementById("notesList"),e=document.getElementById("notesEmpty");if(n)try{const i=(await g.get(`/api/v1/notes?conversationId=${encodeURIComponent(N.id)}`)).notes||[];e&&(e.hidden=i.length>0),n.innerHTML=i.map(s=>`
      <div class="pd-note" style="border:1px solid #f1f5f9; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
          <span class="pd-note-tag" style="background:#f0fdf4; color:#15803d; font-size:10.5px;
            font-weight:700; border-radius:4px; padding:1px 7px;">${j(s.status||"Ghi chú")}</span>
          <span style="font-size:10.5px; color:#94a3b8;">${j(ke(s.createdAt))}${s.authorName?" · "+j(s.authorName):""}</span>
        </div>
        <div style="font-size:12.5px; color:#334155; line-height:1.5; white-space:pre-wrap;">${j(s.content||"")}</div>
      </div>`).join("")}catch(t){n.innerHTML=`<div style="color:#b91c1c; font-size:12.5px;">${j(t.message)}</div>`}}function jn(){const n=document.getElementById("panel-notes");if(!n||n.dataset.wired)return;n.dataset.wired="1";const e=n.querySelector("textarea"),t=n.querySelector("select"),i=n.querySelector(".pd-note-submit, button");if(!e||!i)return;t&&g.get("/api/v1/notes/statuses").then(o=>{const a=o.statuses||[];a.length&&(t.innerHTML=a.map(r=>`<option value="${j(r.value??r)}">${j(r.label??r)}</option>`).join(""))}).catch(()=>{});const s=i.cloneNode(!0);i.replaceWith(s),s.addEventListener("click",async()=>{var a;const o=e.value.trim();if(!o){alert("Chưa nhập nội dung ghi chú.");return}s.disabled=!0;try{await g.post("/api/v1/notes",{conversationId:N.id,contactId:((a=N.contact)==null?void 0:a.id)||void 0,content:o,status:(t==null?void 0:t.value)||void 0}),e.value="",$e()}catch(r){alert("Không lưu được: "+r.message)}finally{s.disabled=!1}})}function zn(){const n=["#btnOpenDetail","#btnGoOrder","#btnViewHistory"];document.addEventListener("click",t=>{(n.some(i=>t.target.closest(i))||t.target.closest("[data-open-detail]"))&&setTimeout(it,80)});const e=document.getElementById("view-detail");e&&new MutationObserver(()=>{(e.classList.contains("view--open")||e.style.transform==="")&&it()}).observe(e,{attributes:!0,attributeFilter:["class","style"]}),jn()}function Fn(){De=null,An()}const z=n=>String(n??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]);let S=null,wt=null;function X(){return wt}const Ve=new Set;function Un(n){const e=new Date(n);return isNaN(e)?"":e.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}function Gn(n){return new Date(n).toLocaleDateString("vi-VN",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"})}function Wn(n){try{const e=JSON.parse(n.content),t=e.thumb||e.href||e.hdUrl;return t?t.startsWith("http")?t:se+t:null}catch{return null}}function Xn(n){const e=n.senderType==="self"||n.senderType==="user",t=e?"msg--sent":"msg--received";let i;if(n.isDeleted)i='<div class="msg__bubble" style="opacity:.6; font-style:italic;">Tin nhắn đã thu hồi</div>';else if(n.contentType==="image"){const o=Wn(n);i=o?`<a href="${z(o)}" target="_blank" rel="noreferrer"><img src="${z(o)}" alt=""
           style="max-width:220px; border-radius:12px; display:block;"
           onerror="this.outerHTML='<div class=&quot;msg__image&quot;><span>📷 Hình ảnh (không tải được)</span></div>'"></a>`:'<div class="msg__image"><span>📷 Hình ảnh</span></div>'}else if(n.contentType==="sticker")i='<div style="font-size:38px;">💟</div>';else{const o=String(n.content||""),a=o.startsWith("{")?"📎 Nội dung đính kèm":o;i=`<div class="msg__bubble" style="white-space:pre-wrap; overflow-wrap:anywhere;">${z(a)}</div>`}const s=e&&n.aiGenerated?'<div style="font-size:10px; color:#7c3aed; margin-bottom:2px;">🤖 AI</div>':"";return`
    <div class="msg ${t}" data-mid="${z(n.id)}">
      <div>${s}${i}<div class="msg__time">${Un(n.sentAt)}</div></div>
    </div>`}function Ne(n,e){let t="",i=n.dataset.lastDay||"";for(const s of e){if(s.id&&Ve.has(s.id))continue;s.id&&Ve.add(s.id);const o=new Date(s.sentAt).toDateString();o!==i&&(t+=`<div class="chat-messages__date">${z(Gn(s.sentAt))}</div>`,i=o),t+=Xn(s)}n.dataset.lastDay=i,n.insertAdjacentHTML("beforeend",`<div class="msg-wrapper">${t}</div>`),n.scrollTop=n.scrollHeight}function Qn(n,e){var B,T,L,V,J;const t=document.getElementById("chatMessages"),i=document.getElementById("chatInput"),s=document.getElementById("btnSend");(B=S==null?void 0:S.leave)==null||B.call(S),Ve.clear(),t.innerHTML='<div style="text-align:center; color:#94a3b8; font-size:13px; padding:26px 0;">Đang tải tin nhắn…</div>',delete t.dataset.lastDay;const o=((T=n.contact)==null?void 0:T.crmName)||((L=n.contact)==null?void 0:L.fullName)||n.displayName||"Không tên",a=document.querySelector("#view-chat .chat-peer__name");if(a){const v=o.length>22?o.slice(0,22)+"…":o;[...a.childNodes].forEach(C=>{var E;C.nodeType===1&&((E=C.classList)!=null&&E.contains("pipeline-chip"))||C.remove()}),a.prepend(document.createTextNode(v))}const r=document.querySelector("#view-chat .chat-peer__meta");r&&(r.innerHTML=`qua <span class="zalo-ic">Z</span> ${z(((V=n.channelAccount)==null?void 0:V.displayName)||"")}`);const c=document.querySelector("#view-chat .chat-peer__avatar");if(c){const v=o.trim().split(/\s+/);c.textContent=(v.length>1?v[0][0]+v[v.length-1][0]:v[0].slice(0,2)).toUpperCase()}(J=window.navOpen)==null||J.call(window,"view-chat");const l=n.id;wt=n,S={convId:l,onBack:e,leave:null},Vn(n),Fn(),Bn(),Rn(),kt(n.aiMode),g.get(`/api/v1/conversations/${l}/messages?limit=100`).then(v=>{t.innerHTML="",delete t.dataset.lastDay,Ne(t,v.messages||[]),(v.messages||[]).length||(t.innerHTML='<div style="text-align:center; color:#94a3b8; font-size:13px; padding:26px 0;">Chưa có tin nhắn nào.</div>')}).catch(v=>{t.innerHTML=`<div style="text-align:center; color:#b91c1c; font-size:13px; padding:26px 0;">${z(v.message)}</div>`});let d=null;S.leave=xn(l,v=>Ne(t,[v]),v=>{d==null||d.remove(),d=null,v&&(d=document.createElement("div"),d.style.cssText="color:#7c3aed; font-size:12px; padding:6px 12px;",d.textContent="🤖 AI đang soạn trả lời…",t.appendChild(d),t.scrollTop=t.scrollHeight)});const h=s.cloneNode(!0);s.replaceWith(h);const u=i.cloneNode(!0);i.replaceWith(u);async function m(){const v=u.value.trim();if(!(!v||h.disabled)){h.disabled=!0;try{const C=await g.post(`/api/v1/conversations/${l}/messages`,{content:v});if(u.value="",C!=null&&C.message&&Ne(t,[C.message]),C&&C.sentViaZalo===!1){const E=document.createElement("div");E.style.cssText="color:#b45309; font-size:11px; text-align:right; padding:0 12px 6px;",E.textContent="Đã lưu — chưa gửi được ra Zalo (tài khoản chưa kết nối)",t.appendChild(E),t.scrollTop=t.scrollHeight}}catch(C){alert("Không gửi được: "+C.message)}finally{h.disabled=!1,u.focus()}}}h.addEventListener("click",m),u.addEventListener("keydown",v=>{v.key==="Enter"&&!v.shiftKey&&(v.preventDefault(),m())});const k=document.querySelector("#view-chat .appbar__back");k&&!k.dataset.wiredReal&&(k.dataset.wiredReal="1",k.addEventListener("click",()=>{var v,C;(v=S==null?void 0:S.leave)==null||v.call(S),(C=S==null?void 0:S.onBack)==null||C.call(S),S=null}))}const Jn=30,xt=[{},{unread:"true"},{assignedTo:"me"},{unreplied:"true"}],_={items:[],page:1,total:0,chip:0,search:"",loading:!1},st=["#16a34a","#7c3aed","#db2777","#ea580c","#2563eb","#0d9488"],K=n=>String(n??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]);function Yn(n){const e=String(n).trim().split(/\s+/);return(e.length>1?e[0][0]+e[e.length-1][0]:e[0].slice(0,2)).toUpperCase()}function Zn(n){let e=0;for(const t of String(n))e=e*31+t.charCodeAt(0)>>>0;return st[e%st.length]}function ei(n){if(!n)return"";const e=new Date(n),t=Date.now()-e.getTime(),i=Math.floor(t/6e4);if(i<1)return"vừa xong";if(i<60)return`${i}p`;const s=Math.floor(i/60);if(s<24)return`${s}h`;const o=Math.floor(s/24);return o<7?`${o}d`:e.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit"})}function ti(n){var i;const e=(i=n.messages)==null?void 0:i[0];if(!e)return"";if(e.isDeleted)return"Tin nhắn đã thu hồi";if(e.contentType==="image")return"📷 Hình ảnh";if(e.contentType==="file")return"📄 Tệp đính kèm";if(e.contentType==="sticker")return"💟 Sticker";if(e.contentType==="birthday_notification")return"🎂 Thông báo sinh nhật";const t=String(e.content||"");return t.startsWith("{")?"📎 Nội dung đính kèm":t}function ot(n){var e,t;return((e=n.contact)==null?void 0:e.crmName)||((t=n.contact)==null?void 0:t.fullName)||n.displayName||"Không tên"}function ni(n,{append:e=!1}={}){const t=_.items.map(o=>{var a;return`
    <div class="conv-item" data-id="${K(o.id)}">
      <div class="conv-item__avatar" style="background:${Zn(o.id)};">${K(Yn(ot(o)))}</div>
      <div class="conv-item__body">
        <div class="conv-item__top">
          <span class="conv-item__name">${K(ot(o))}</span>
          <span class="conv-item__time">${K(ei(o.lastMessageAt))}</span>
        </div>
        <div class="conv-item__preview">${K(ti(o))}</div>
        <div class="conv-item__source"><span class="zalo-ic">Z</span><span>${K(((a=o.channelAccount)==null?void 0:a.displayName)||"")}</span></div>
      </div>
      ${o.unreadCount?`<span class="conv-item__unread">${o.unreadCount>9?"9+":o.unreadCount}</span>`:""}
    </div>`}).join(""),i=_.items.length<_.total?`<button id="convMore" style="display:block; margin:10px auto 16px; border:1px solid #e2e8f0;
         background:#fff; color:#475569; font-size:13px; font-weight:600; padding:9px 22px;
         border-radius:20px;">Tải thêm (${_.total-_.items.length})</button>`:"",s=!_.items.length&&!_.loading?`<div style="text-align:center; color:#94a3b8; font-size:13px; padding:34px 0;">
         Không có hội thoại nào${_.chip===2?" được gán cho bạn":""}.</div>`:"";n.innerHTML=t+i+s}async function F(n,{append:e=!1}={}){if(!_.loading){_.loading=!0,e||(n.innerHTML='<div style="text-align:center; color:#94a3b8; font-size:13px; padding:30px 0;">Đang tải…</div>');try{const t=new URLSearchParams({limit:String(Jn),page:String(_.page),...xt[_.chip]});_.search&&t.set("search",_.search);const i=await g.get(`/api/v1/conversations?${t}`);_.total=i.total??0,_.items=e?[..._.items,...i.conversations||[]]:i.conversations||[],ni(n,{append:e})}catch(t){n.innerHTML=`<div style="text-align:center; color:#b91c1c; font-size:13px; padding:30px 0;">${K(t.message)}</div>`}finally{_.loading=!1}}}function ii(){const n=document.getElementById("convList"),e=n.cloneNode(!1);n.replaceWith(e),e.addEventListener("click",o=>{if(o.target.closest("#convMore")){_.page++,F(e,{append:!0});return}const r=o.target.closest(".conv-item");if(!r)return;const c=_.items.find(l=>l.id===r.dataset.id);c&&Qn(c,()=>F(e))}),[...document.querySelectorAll("#home-chats .chip")].forEach((o,a)=>{const r=o.cloneNode(!0);if(o.replaceWith(r),a>=xt.length){r.style.opacity=".45",r.addEventListener("click",()=>alert("Bộ lọc này sẽ có ở bản sau."));return}r.addEventListener("click",()=>{document.querySelectorAll("#home-chats .chip").forEach(c=>c.classList.toggle("chip--active",c===r)),_.chip=a,_.page=1,F(e)})});const i=document.querySelector('#home-chats input[placeholder*="Tìm"]');if(i){const o=i.cloneNode(!0);i.replaceWith(o);let a;o.addEventListener("input",()=>{clearTimeout(a),a=setTimeout(()=>{_.search=o.value.trim(),_.page=1,F(e)},400)})}let s;Tn(()=>{clearTimeout(s),s=setTimeout(()=>{_.page=1,F(e)},1500)}),F(e)}const A=n=>String(n??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),M=n=>new Intl.NumberFormat("vi-VN").format(n??0),si={subscriber:{name:"Đăng ký",color:"#2563eb"},lead:{name:"Lead",color:"#f59e0b"},qualified:{name:"Đủ điều kiện",color:"#9333ea"},opportunity:{name:"Cơ hội",color:"#ea580c"},customer:{name:"Khách hàng",color:"#16a34a"},evangelist:{name:"VIP/Đại sứ",color:"#0891b2"},churned:{name:"Rời bỏ",color:"#ef4444"}},at=["#16a34a","#7c3aed","#db2777","#ea580c","#2563eb","#0d9488"],Tt=n=>{let e=0;for(const t of String(n))e=e*31+t.charCodeAt(0)>>>0;return at[e%at.length]},Ge=n=>{const e=String(n||"?").trim().split(/\s+/);return(e.length>1?e[0][0]+e[e.length-1][0]:e[0].slice(0,2)).toUpperCase()},y={page:1,total:0,items:[],stage:"",search:"",loading:!1};function oi(n){const e=y.items.map(s=>{const o=s.crmName||s.fullName||"Không tên",a=si[s.lifecycleStage]||{name:s.lifecycleStage||"—",color:"#64748b"};return`
      <div class="crm-card">
        <div class="crm-card__top">
          <div class="crm-card__avatar" style="background:${Tt(s.id)};">${A(Ge(o))}</div>
          <div class="crm-card__body">
            <div class="crm-card__name">${A(o)}</div>
            <div class="crm-card__phone">${A(s.phone||"Chưa có SĐT")}</div>
          </div>
          <span class="crm-stage" style="background:${a.color}18; color:${a.color};">
            <span class="crm-stage__dot" style="background:${a.color};"></span>${A(a.name)}</span>
        </div>
        <div class="crm-card__meta">
          <span class="crm-tag">🌐 ${A(s.source||"—")}</span>
          <span class="crm-tag">⭐ ${s.leadScore??0} điểm</span>
        </div>
      </div>`}).join(""),t=y.items.length<y.total?`<button id="custMore" style="display:block; margin:10px auto 16px; border:1px solid #e2e8f0;
        background:#fff; color:#475569; font-size:13px; font-weight:600; padding:9px 22px;
        border-radius:20px;">Tải thêm (${M(y.total-y.items.length)})</button>`:"";n.innerHTML=e+t||'<div style="text-align:center; color:#94a3b8; font-size:13px; padding:30px 0;">Không có liên hệ nào.</div>';const i=document.getElementById("custCount");i&&(i.textContent=`${M(y.total)} liên hệ`)}async function te(n,{append:e=!1}={}){if(!y.loading){y.loading=!0,e||(n.innerHTML='<div style="text-align:center; color:#94a3b8; font-size:13px; padding:30px 0;">Đang tải…</div>');try{const t=new URLSearchParams({limit:"30",page:String(y.page)});y.stage&&t.set("lifecycleStage",y.stage),y.search&&t.set("search",y.search);const i=await g.get(`/api/v1/contacts?${t}`);y.total=i.total??0,y.items=e?[...y.items,...i.contacts||[]]:i.contacts||[],oi(n)}catch(t){n.innerHTML=`<div style="color:#b91c1c; font-size:13px; padding:20px;">${A(t.message)}</div>`}finally{y.loading=!1}}}function ai(){const n=document.getElementById("custList");if(!n)return;const e=n.cloneNode(!1);n.replaceWith(e),e.addEventListener("click",o=>{o.target.closest("#custMore")&&(y.page++,te(e,{append:!0}))});const t={"Liên hệ":"",Leads:"lead","Khách hàng":"customer"};document.querySelectorAll("#home-customers .crm-seg__chip").forEach(o=>{const a=o.textContent.replace(/[^\wÀ-ỹ ]/g,"").trim(),r=o.cloneNode(!0);if(o.replaceWith(r),!(a in t)){r.style.opacity=".45",r.addEventListener("click",()=>alert("Mục này sẽ có ở bản sau."));return}r.addEventListener("click",()=>{document.querySelectorAll("#home-customers .crm-seg__chip").forEach(c=>c.classList.toggle("crm-seg__chip--active",c===r)),y.stage=t[a],y.page=1,te(e)})});const i=document.querySelector('#home-customers input[placeholder*="Tìm"]');if(i){const o=i.cloneNode(!0);i.replaceWith(o);let a;o.addEventListener("input",()=>{clearTimeout(a),a=setTimeout(()=>{y.search=o.value.trim(),y.page=1,te(e)},400)})}const s=document.getElementById("addCustSubmit");if(s){const o=s.cloneNode(!0);s.replaceWith(o),o.addEventListener("click",async()=>{var l,d;const a=document.getElementById("addCustSheet"),r=(l=a.querySelector('input[placeholder*="tên liên hệ"]'))==null?void 0:l.value.trim(),c=(d=a.querySelector('input[placeholder*="0912"]'))==null?void 0:d.value.trim();if(!r){alert("Chưa nhập tên khách.");return}o.disabled=!0;try{await g.post("/api/v1/contacts",{fullName:r,phone:c||void 0,source:"mobile"}),alert("✓ Đã thêm khách hàng."),a.classList.remove("open"),y.page=1,te(e)}catch(h){alert("Không thêm được: "+h.message)}finally{o.disabled=!1}})}te(e)}function U(n,e,t){var s;const i=[...document.querySelectorAll("#home-overview .kpi")].find(o=>{var a;return((a=o.querySelector(".kpi__label"))==null?void 0:a.textContent.trim())===n});i&&(i.querySelector(".kpi__value").textContent=e,t!=null&&(i.querySelector(".kpi__sub").textContent=t),(s=i.querySelector(".kpi__trend"))==null||s.remove())}async function ri(){var u,m,k,B;const n=w.user(),e=document.querySelector("#home-overview .lt-head__title");e&&(n!=null&&n.fullName)&&(e.textContent=`Chào ${n.fullName} 👋`);const t=document.querySelector("#home-overview .lt-head__sub");t&&(t.textContent=new Date().toLocaleDateString("vi-VN",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"})+" · Trà Dược Việt Nam");let i;try{i=await g.get("/api/v1/dashboard/overview")}catch(T){const L=document.querySelector("#home-overview .ov");L==null||L.insertAdjacentHTML("afterbegin",`<div style="color:#b91c1c; font-size:12.5px; margin-bottom:10px;">Không tải được số liệu: ${A(T.message)}</div>`);return}const s=i.conversations||{};U("Tin nhắn hôm nay",M(s.messagesToday),"Cả gửi và nhận"),U("Chưa trả lời",M(s.unrepliedConversations),"Hội thoại chờ trả lời"),U("Chưa đọc",M(s.unreadConversations),`${M(s.unreadMessages)} tin nhắn chưa xem`),U("Lịch hẹn hôm nay",M(i.appointmentsToday),"Hôm nay"),U("KH mới tuần này",M((u=i.contacts)==null?void 0:u.newThisWeek),"Trong 7 ngày qua"),U("Tổng khách hàng",M((m=i.contacts)==null?void 0:m.total),"Đang hoạt động");const o=["owner","admin","manager"].includes(i.role),a=i.sales?o?i.sales.org:i.sales.mine:null,r=!o&&i.sales&&!i.sales.mine,c=T=>T>=1e6?(T/1e6).toFixed(1).replace(/\.0$/,"")+" tr":M(T)+"đ",l=document.querySelector("#home-overview .kpi-grid");(k=document.getElementById("mSales"))==null||k.remove(),a&&l?l.insertAdjacentHTML("beforebegin",`
      <div id="mSales" style="background:linear-gradient(135deg,#0D6838,#16a34a); border-radius:14px;
          padding:14px 16px; margin-bottom:12px; color:#fff;">
        <div style="font-size:11.5px; opacity:.85;">💰 Doanh thu ${o?"toàn công ty":"của tôi"} · 7 ngày</div>
        <div style="font-size:24px; font-weight:800; margin:2px 0;">${c(a.week.gmv)}</div>
        <div style="font-size:11.5px; opacity:.85;">${M(a.week.orders)} đơn · hôm nay ${c(a.today.gmv)} (${M(a.today.orders)} đơn)</div>
      </div>`):r&&l?l.insertAdjacentHTML("beforebegin",`<div id="mSales" style="font-size:11.5px; color:#64748b; background:#f8fafc; border-radius:8px;
        padding:8px 10px; margin-bottom:10px;">💰 Doanh thu cá nhân: tài khoản chưa liên kết CRM — liên hệ quản trị.</div>`):i.salesError&&l&&l.insertAdjacentHTML("beforebegin",`<div id="mSales" style="font-size:11.5px; color:#92400e; background:#fef3c7; border-radius:8px;
        padding:8px 10px; margin-bottom:10px;">⚠️ Chưa lấy được doanh thu từ CRM</div>`);const d=document.getElementById("activityFeed");d&&(d.innerHTML='<div style="color:#94a3b8; font-size:12.5px; padding:8px 0;">Nhật ký hoạt động sẽ có ở bản sau.</div>'),(B=document.querySelector("#home-overview .bar-chart"))==null||B.closest('.ov-card, .section, div[class*="card"]'),["barChart","pipeline"].forEach(T=>{const L=document.getElementById(T);if(L){const V=L.closest(".ov-card")||L.parentElement;V.style.display="none"}});const h=document.querySelector("#home-overview .donut");h&&((h.closest(".ov-card")||h.parentElement).style.display="none"),document.querySelectorAll("#home-overview .ov-nav__chip:not(.ov-nav__chip--active)").forEach(T=>{T.style.opacity=".45"}),document.querySelectorAll("#home-overview .ov-btn").forEach(T=>{T.style.display="none"})}function ci(){var r,c;const n=w.user(),e=document.querySelector("#home-settings .me-card");if(!e||!n)return;const t=(l,d,h=!0)=>{const u=[...e.querySelectorAll(".me-field")].find(k=>{var B;return(B=k.querySelector("label"))==null?void 0:B.textContent.trim().startsWith(l)}),m=u==null?void 0:u.querySelector("input");m&&(m.value=d??"",h&&(m.disabled=!0))},i={owner:"Chủ tài khoản",admin:"Quản trị viên",manager:"Quản lý",member:"Nhân viên"};t("Họ và tên",n.fullName),t("Vai trò",i[n.role]||n.role),t("Email",n.email);const s=e.querySelector(".me-avatar");s&&(s.textContent=Ge(n.fullName)),(r=e.querySelector(".me-avatar-btn"))==null||r.remove(),(c=e.querySelector(".me-save"))==null||c.remove();const o=["owner","admin"].includes(n.role)&&!n.impersonatedBy;e.insertAdjacentHTML("beforeend",`
    <div style="margin-top:14px; display:grid; gap:8px;">
      ${o?`<button id="meImp" style="border:1px solid #fde68a; background:#fffbeb; color:#b45309;
        border-radius:10px; padding:11px; font-size:13px; font-weight:700;">👁️ Xem dưới quyền nhân viên khác</button>`:""}
      <button id="meLogout" style="border:1px solid #fecaca; background:#fff; color:#ef4444;
        border-radius:10px; padding:11px; font-size:13px; font-weight:700;">Đăng xuất</button>
    </div>`),document.getElementById("meLogout").onclick=()=>{confirm("Đăng xuất khỏi thiết bị này?")&&Lt()};const a=document.getElementById("meImp");a&&(a.onclick=li),di()}const ie="chatmql_m_orig_session";async function li(){let n;try{n=await g.get("/api/v1/settings/team")}catch(i){alert(i.message);return}const e=(n.members||n.users||[]).filter(i=>["manager","member"].includes(i.role)&&i.isActive!==!1),t=document.createElement("div");t.id="impSheet",t.style.cssText=`position:fixed; left:0; right:0; bottom:0; z-index:400; background:#fff;
    border-radius:16px 16px 0 0; box-shadow:0 -10px 30px rgba(15,23,42,.2); padding:14px 16px 24px; max-height:65vh; overflow:auto;`,t.innerHTML=`<div style="font-size:13.5px; font-weight:800; margin-bottom:4px;">👁️ Xem dưới quyền nhân viên
      <span style="float:right; color:#94a3b8; cursor:pointer;" id="impClose">✕</span></div>
    <div style="font-size:11.5px; color:#64748b; margin-bottom:10px;">Xem hệ thống đúng như nhân viên đó thấy. Mọi lượt xem đều được ghi nhật ký.</div>
    ${e.map(i=>`<button data-uid="${A(i.id)}" style="display:flex; gap:10px; align-items:center; width:100%;
        border:1px solid #f1f5f9; background:#fff; border-radius:10px; padding:9px 12px; margin-bottom:6px; text-align:left;">
        <span style="width:32px; height:32px; border-radius:50%; background:${Tt(i.id)}; color:#fff;
          display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;">${A(Ge(i.fullName))}</span>
        <span><b style="font-size:13px;">${A(i.fullName)}</b><br><small style="color:#64748b;">${A(i.email)} · ${A(i.role)}</small></span>
      </button>`).join("")||'<div style="color:#94a3b8; font-size:12.5px;">Không có nhân viên nào.</div>'}`,document.body.appendChild(t),t.querySelector("#impClose").onclick=()=>t.remove(),t.querySelectorAll("[data-uid]").forEach(i=>{i.onclick=async()=>{try{const s=await g.post(`/api/v1/auth/impersonate/${i.dataset.uid}`);localStorage.setItem(ie,JSON.stringify({token:w.token(),refreshToken:w.refreshToken(),user:w.user()})),w.save({token:s.token,user:s.user}),localStorage.removeItem("chatmql_m_refresh"),location.reload()}catch(s){alert(s.message)}}})}function di(){const n=w.user();if(!(n!=null&&n.impersonatedBy))return;const e=document.querySelector(".impersonate");e&&(e.style.display="",e.innerHTML=`👁️ Đang xem dưới quyền <b>${A(n.fullName)}</b> ·
    <a href="#" id="impStop" style="color:inherit; text-decoration:underline;">Quay lại tài khoản gốc</a>`,e.querySelector("#impStop").onclick=async t=>{t.preventDefault();try{const i=await g.post("/api/v1/auth/stop-impersonation"),s=JSON.parse(localStorage.getItem(ie)||"null");w.save({token:i.token||(s==null?void 0:s.token),refreshToken:s==null?void 0:s.refreshToken,user:i.user||(s==null?void 0:s.user)}),localStorage.removeItem(ie),location.reload()}catch{const i=JSON.parse(localStorage.getItem(ie)||"null");i&&(w.save(i),localStorage.removeItem(ie),location.reload())}})}function hi(){ai(),ri(),ci()}const ui=`<div class="impersonate">👁 Đang xem dưới quyền <b>Lộc Thị Hạnh</b> · <u>Quay lại tài khoản gốc</u></div>

  <!-- ========== MÀN 1: DANH SÁCH HỘI THOẠI ========== -->
  <div class="view view--open" id="view-list">
    <!-- Panel Tổng quan -->
    <div class="home-panel" id="home-overview">
      <div class="lt-head">
        <div class="lt-head__row">
          <span class="avatar-lg">LT</span>
          <div style="flex:1; min-width:0;">
            <div class="lt-head__title" style="font-size:17px;">Chào Lộc Thị Hạnh 👋</div>
            <div class="lt-head__sub">Thứ Tư, 19/08/2026 · Trà Dược Việt Nam</div>
          </div>
          <button class="appbar__btn">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>
            <span class="appbar__badge">9+</span>
          </button>
        </div>
      </div>
      <div class="ov">
        <div class="lt-head__sub" style="margin:-2px 0 12px;">Đây là tổng quan hoạt động hôm nay của bạn.</div>

        <!-- Mục điều hướng (từ sidebar desktop) -->
        <div class="ov-nav">
          <button class="ov-nav__chip ov-nav__chip--active">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            Dashboard
          </button>
          <button class="ov-nav__chip">📥 Hộp thư <span class="ov-nav__badge">295</span></button>
          <button class="ov-nav__chip">🕐 Hoạt động</button>
          <button class="ov-nav__chip">✅ Việc cần làm</button>
          <button class="ov-nav__chip">📅 Lịch hẹn</button>
        </div>

        <!-- Hành động -->
        <div class="ov-actions">
          <button class="ov-btn ov-btn--outline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
            Xuất báo cáo
          </button>
          <button class="ov-btn ov-btn--primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Thêm nhanh
          </button>
        </div>

        <!-- 6 thẻ KPI -->
        <div class="kpi-grid">
          <div class="kpi">
            <div class="kpi__top"><div class="kpi__icon" style="background:#e8f0fe; color:#2563eb;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>
            </div></div>
            <div class="kpi__label">Tin nhắn hôm nay</div><div class="kpi__value">303</div><div class="kpi__sub">Hôm nay</div>
          </div>
          <div class="kpi">
            <div class="kpi__top"><div class="kpi__icon" style="background:#fef3c7; color:#f59e0b;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>
            </div></div>
            <div class="kpi__label">Chưa trả lời</div><div class="kpi__value">884</div><div class="kpi__sub">Cần xử lý</div>
          </div>
          <div class="kpi">
            <div class="kpi__top"><div class="kpi__icon" style="background:#f1f5f9; color:#64748b;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>
            </div></div>
            <div class="kpi__label">Chưa đọc</div><div class="kpi__value">417</div><div class="kpi__sub">Tin nhắn chưa xem</div>
          </div>
          <div class="kpi">
            <div class="kpi__top"><div class="kpi__icon" style="background:#dcfce7; color:#16a34a;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
            </div></div>
            <div class="kpi__label">Lịch hẹn hôm nay</div><div class="kpi__value">0</div><div class="kpi__sub">Hôm nay</div>
          </div>
          <div class="kpi">
            <div class="kpi__top"><div class="kpi__icon" style="background:#fef2f2; color:#ef4444;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
            </div><span class="kpi__trend">▲ +75</span></div>
            <div class="kpi__label">KH mới tuần này</div><div class="kpi__value">75</div><div class="kpi__sub">Trong 7 ngày qua</div>
          </div>
          <div class="kpi">
            <div class="kpi__top"><div class="kpi__icon" style="background:#f3e8ff; color:#9333ea;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg>
            </div></div>
            <div class="kpi__label">Tổng khách hàng</div><div class="kpi__value">13.351</div><div class="kpi__sub">Đang hoạt động</div>
          </div>
        </div>

        <!-- Tin nhắn theo ngày -->
        <div class="ov-card">
          <div class="ov-card__head">
            <div>
              <div class="ov-card__title">Tin nhắn theo ngày</div>
              <div class="ov-card__sub">7 ngày gần nhất · Tổng 4.498 tin</div>
            </div>
            <div class="ov-legend">
              <span class="ov-legend__item"><span class="ov-legend__dot" style="background:#3b82f6;"></span>Đã gửi</span>
              <span class="ov-legend__item"><span class="ov-legend__dot" style="background:#93c5fd;"></span>Đã nhận</span>
            </div>
          </div>
          <div class="bar-chart" id="barChart"></div>
        </div>

        <!-- Pipeline khách hàng -->
        <div class="ov-card">
          <div class="ov-card__head">
            <div>
              <div class="ov-card__title">Pipeline khách hàng</div>
              <div class="ov-card__sub">13.351 khách hàng đang theo dõi</div>
            </div>
            <span class="ov-card__link">Xem tất cả ›</span>
          </div>
          <div id="pipeline"></div>
        </div>

        <!-- Nguồn khách hàng -->
        <div class="ov-card">
          <div class="ov-card__head"><div class="ov-card__title">Nguồn khách hàng</div></div>
          <div class="donut-wrap">
            <div class="donut" style="background:conic-gradient(#436007 0 0.12%, #4736c5 0.12% 1.3%, #3b82f6 1.3% 100%);">
              <div class="donut__center"><b>13.351</b><span>khách hàng</span></div>
            </div>
            <div class="donut-legend">
              <div class="donut-legend__item"><span class="donut-legend__dot" style="background:#436007;"></span><span class="donut-legend__name">Web</span><span class="donut-legend__val">16</span></div>
              <div class="donut-legend__item"><span class="donut-legend__dot" style="background:#4736c5;"></span><span class="donut-legend__name">zalo_oa</span><span class="donut-legend__val">157</span></div>
              <div class="donut-legend__item"><span class="donut-legend__dot" style="background:#3b82f6;"></span><span class="donut-legend__name">Zalo</span><span class="donut-legend__val">13.178</span></div>
            </div>
          </div>
        </div>

        <!-- Hoạt động gần đây -->
        <div class="ov-card">
          <div class="ov-card__head">
            <div class="ov-card__title">Hoạt động gần đây</div>
            <span class="ov-card__link">↻ Làm mới</span>
          </div>
          <div id="activityFeed"></div>
        </div>
      </div>
    </div>

    <!-- Panel Hội thoại -->
    <div class="home-panel home-panel--active" id="home-chats">
      <div class="lt-head">
        <div class="lt-head__row">
          <div class="lt-head__title">Hội thoại</div>
          <button class="appbar__btn">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>
            <span class="appbar__badge">9+</span>
          </button>
          <span class="avatar-lg" style="width:34px; height:34px; font-size:11px;" title="Lộc Thị Hạnh">LT</span>
        </div>
      </div>
      <div class="home-head">
        <div class="search-input">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input placeholder="Tìm cuộc trò chuyện...">
        </div>
        <div class="chip-row">
          <button class="chip chip--active">Tất cả</button>
          <button class="chip">Chưa đọc</button>
          <button class="chip">Của tôi</button>
          <button class="chip">Chưa trả lời</button>
          <button class="chip">Cuộc gọi nhỡ</button>
          <button class="chip">Lịch hẹn</button>
        </div>
      </div>
      <div class="conv-list" id="convList"></div>
    </div>

    <!-- Panel Khách hàng — màn CRM Liên hệ -->
    <div class="home-panel" id="home-customers">
      <div class="lt-head">
        <div class="lt-head__row">
          <div style="flex:1; min-width:0;">
            <div class="lt-head__title">Liên hệ</div>
            <div class="lt-head__sub" id="custCount">9 liên hệ</div>
          </div>
          <button class="appbar__btn" id="btnAddCust" title="Thêm khách hàng">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
        </div>
      </div>
      <!-- Segment (từ sidebar desktop) -->
      <div class="crm-seg">
        <button class="crm-seg__chip crm-seg__chip--active">👥 Liên hệ</button>
        <button class="crm-seg__chip">🏢 Công ty</button>
        <button class="crm-seg__chip">➕ Leads</button>
        <button class="crm-seg__chip">✓ Khách hàng</button>
        <button class="crm-seg__chip">📅 Lịch hẹn</button>
        <button class="crm-seg__chip">💬 Nhóm Zalo</button>
        <button class="crm-seg__chip">🧑 Bạn bè Zalo</button>
      </div>
      <div class="home-head" style="padding-top:0;">
        <div class="search-input">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input placeholder="Tìm theo tên / SĐT / email...">
        </div>
      </div>
      <div class="crm-filters">
        <button class="crm-filter">▽ Nguồn ⌄</button>
        <button class="crm-filter">▽ Giai đoạn ⌄</button>
        <button class="crm-filter">▽ Sale ⌄</button>
        <button class="crm-filter">⤒ Nhập</button>
        <button class="crm-filter">⤓ Xuất CSV</button>
      </div>
      <div class="crm-list" id="custList"></div>
    </div>

    <!-- Panel Cài đặt (Cá nhân) -->
    <div class="home-panel" id="home-settings">
      <div class="lt-head">
        <div class="lt-head__row">
          <div class="lt-head__title">Cá nhân</div>
        </div>
      </div>
      <div class="set">
        <!-- Menu con Cài đặt (từ sidebar desktop) -->
        <div class="me-nav">
          <button class="me-nav__chip me-nav__chip--active">👤 Hồ sơ của tôi</button>
          <button class="me-nav__chip">🔒 Mật khẩu &amp; Bảo mật</button>
          <button class="me-nav__chip">🔔 Thông báo</button>
        </div>

        <!-- Hồ sơ của tôi -->
        <div class="me-card">
          <div class="me-avatar-wrap">
            <div class="me-avatar">LT</div>
            <button class="me-avatar-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
              Đổi ảnh
            </button>
          </div>
          <div class="me-field"><label>Họ và tên</label><input type="text" value="Lộc Thị Hạnh"></div>
          <div class="me-field"><label>Vai trò</label><input type="text" value="member" disabled></div>
          <div class="me-field"><label>Email</label><input type="email" value="hanhlt@traduoc.ai" disabled><small>Email đăng nhập không thể thay đổi.</small></div>
          <div class="me-field"><label>Thành viên từ</label><input type="text" value="16/5/2026" disabled></div>
          <button class="me-save">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
    <!-- Menu chính kiểu Zalo: Hội thoại · Khách hàng · Tổng quan · Cá nhân -->
    <div class="bottomnav">
      <button class="bottomnav__item bottomnav__item--active" data-home="chats">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>
        Hội thoại
        <span class="bottomnav__badge">4</span>
      </button>
      <button class="bottomnav__item" data-home="customers">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg>
        Khách hàng
      </button>
      <button class="bottomnav__item" data-home="overview">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
        Tổng quan
      </button>
      <button class="bottomnav__item" data-home="settings">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Cá nhân
      </button>
    </div>
  </div>

  <!-- ========== MÀN 2: CHAT ========== -->
  <div class="view" id="view-chat">
    <div class="appbar" style="position:relative;">
      <button class="appbar__back" data-nav-back>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <button class="chat-peer" id="btnOpenDetail" title="Xem hồ sơ khách">
        <span class="chat-peer__avatar">KV</span>
        <span style="min-width:0;">
          <span class="chat-peer__name"><span>Kd Vanhoa 0348302234</span><span class="pipeline-chip">● Đăng ký</span></span>
          <span class="chat-peer__meta">qua <span class="zalo-ic">Z</span> Vận Đơn TDVN · Lead 0/100</span>
        </span>
      </button>
      <button class="appbar__btn" id="btnChatLibrary" title="Thư viện hội thoại">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/></svg>
      </button>
      <button class="appbar__btn" id="btnChatMore" title="Tùy chọn khác">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>
      <div class="chat-more-menu" id="chatMoreMenu" hidden>
        <div class="cmm-label">Chế độ AI trả lời</div>
        <button class="cmm-ai cmm-ai--active" data-ai="manual">
          <span class="cmm-ai__ic">✋</span>
          <span class="cmm-ai__body"><b>Thủ công</b><small>Bạn tự trả lời, AI không can thiệp</small></span>
          <span class="cmm-ai__check">✓</span>
        </button>
        <button class="cmm-ai" data-ai="suggest">
          <span class="cmm-ai__ic">💡</span>
          <span class="cmm-ai__body"><b>Gợi ý</b><small>AI soạn nháp, bạn duyệt rồi gửi</small></span>
          <span class="cmm-ai__check">✓</span>
        </button>
        <button class="cmm-ai" data-ai="auto">
          <span class="cmm-ai__ic">🤖</span>
          <span class="cmm-ai__body"><b>Tự động</b><small>AI tự trả lời khách</small></span>
          <span class="cmm-ai__check">✓</span>
        </button>
        <div class="cmm-divider"></div>
        <button class="cmm-danger" id="btnDeleteConv">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Xóa hội thoại
        </button>
      </div>
    </div>

    <div class="chat-messages" id="chatMessages">
      <div class="msg-wrapper">
        <div class="chat-messages__date">Thứ Bảy, 13/06/2026</div>
        <div class="msg msg--sent">
          <div class="msg__avatar" style="background:#16a34a;">VĐ</div>
          <div>
            <div class="msg__image"><span>📷 Hình ảnh (không tải được)</span></div>
            <div class="msg__time">09:58
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>
            </div>
          </div>
        </div>
      </div>
      <div class="msg-wrapper">
        <div class="chat-messages__date">HÔM NAY</div>
        <div class="msg msg--received">
          <div class="msg__avatar" style="background:#9333ea;">KV</div>
          <div>
            <div class="bday-card">
              <div class="bday-card__head">
                <div class="bday-card__avatar">KV</div>
                <div class="bday-card__name">Ks Văn Hóa</div>
              </div>
              <div class="bday-card__body">
                <div class="bday-card__date">18/08</div>
                <div class="bday-card__hint">Hãy gửi lời chúc tốt đẹp!</div>
                <div class="bday-card__art">🎂🎉🎈</div>
              </div>
            </div>
            <div class="msg__time">10:16</div>
          </div>
        </div>
      </div>
    </div>

    <div class="chat-inputbar">
      <!-- Nút thao tác nhanh: menu hồ sơ khách đưa ra ngoài, Tạo đơn đứng đầu -->
      <div class="chat-inputbar__tools">
        <button class="tool-chip tool-chip--primary" id="btnQuickOrder">Tạo đơn</button>
        <button class="tool-chip tool-chip--active">AI Gợi ý</button>
        <button class="tool-chip">Tin nhanh</button>
        <button class="tool-chip" id="btnQuickSales">Tài liệu</button>
        <button class="tool-chip" id="btnQuickInfo">Thông tin</button>
        <button class="tool-chip" id="btnQuickNotes">Ghi chú</button>
      </div>
      <div class="chat-inputbar__row">
        <button class="chat-inputbar__icon" title="Đính kèm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>
        </button>
        <button class="chat-inputbar__icon" title="Sticker">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/><path d="M15 3v5a1 1 0 0 0 1 1h5"/><path d="M8 13h.01"/><path d="M16 13h.01"/><path d="M10 16s.8 1 2 1c1.3 0 2-1 2-1"/></svg>
        </button>
        <textarea class="chat-inputbar__field" id="chatInput" rows="1" placeholder="Nhập tin nhắn..."></textarea>
        <button class="chat-inputbar__send" id="btnSend" title="Gửi">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>
        </button>
      </div>
    </div>
  </div>

  <!-- ========== MÀN 3: HỒ SƠ KHÁCH (4 tab) ========== -->
  <div class="view" id="view-detail">
    <div class="appbar">
      <button class="appbar__back" data-nav-back>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="chat-peer__avatar" style="width:34px;height:34px;">KV</span>
      <div style="min-width:0; flex:1;">
        <div class="appbar__title" style="font-size:14px;">Kd Vanhoa 0348302234</div>
        <div style="font-size:11px; color:var(--gray-500);">ID: e216ee7f · SĐT: 0348302234</div>
      </div>
    </div>
    <div class="detail-tabs">
      <button class="detail-tab detail-tab--active" data-tab="info">Thông tin</button>
      <button class="detail-tab" data-tab="notes">Ghi chú nhanh</button>
      <button class="detail-tab" data-tab="order">Tạo đơn</button>
      <span class="detail-tabs__divider"></span>
      <button class="detail-tab detail-tab--sales" data-tab="sales">Tài liệu bán hàng</button>
    </div>

    <div class="detail-body" id="detailBody">
      <!-- Tab Thông tin -->
      <div class="detail-panel detail-panel--active" id="panel-info">
        <div class="section">
          <div class="section-head">
            <span class="section-title">THÔNG TIN TỪ CRM</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          </div>
          <div class="crm-stats">
            <div class="crm-stat"><span>Lịch bán hàng</span><b>—</b></div>
            <div class="crm-stat"><span>Lịch chăm sóc</span><b>—</b></div>
            <div class="crm-stat"><span>Số đơn</span><b>0</b></div>
            <div class="crm-stat"><span>Ghi chú</span><b>0</b></div>
          </div>
          <div class="crm-grid">
            <div class="crm-field"><span>Mã khách hàng</span><b>KH031245</b></div>
            <div class="crm-field"><span>Số điện thoại</span><b>0348302234</b></div>
            <div class="crm-field"><span>SĐT liên hệ khác</span><b>—</b></div>
            <div class="crm-field"><span>Người phụ trách</span><b style="color:#2563eb;">Lộc Thị Hạnh</b></div>
            <div class="crm-field"><span>Điểm</span><b style="color:#16a34a;">0</b></div>
            <div class="crm-field"><span>Nghề nghiệp</span><b>—</b></div>
            <div class="crm-field crm-field--full"><span>Nguồn khách hàng</span><b>Zalo cá nhân</b></div>
            <div class="crm-field crm-field--full"><span>Địa chỉ</span><b>—</b></div>
            <div class="crm-field crm-field--full"><span>Địa chỉ 2</span><b>—</b></div>
          </div>
        </div>
        <div class="section">
          <button class="btn-outline" id="btnViewHistory">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            Xem hồ sơ lịch sử mua hàng
          </button>
          <button class="btn-green" id="btnGoOrder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
            Tạo đơn hàng
          </button>
        </div>
        <div class="section">
          <div class="section-head">
            <span class="section-title">THÔNG TIN TÙY CHỈNH <span style="font-weight:400;color:var(--gray-400);">(3)</span></span>
          </div>
          <div class="cf-title">🍵 Trà Info</div>
          <div class="info-row"><span class="lbl">Thích dùng hàng</span><span class="val">Chưa có</span></div>
          <div class="cf-title" style="margin-top:8px;">💬 Zalo</div>
          <div class="info-row"><span class="lbl">Bạn bè Zalo</span><span class="val">Chưa có</span></div>
          <div class="info-row"><span class="lbl">Ngày sinh nhật</span><span class="val val--dark">18/8/2000</span></div>
        </div>
        <div class="ai-fab">
          <button class="ai-btn" id="btnAiAnalyze">✨ Phân tích khách hàng (AI)</button>
        </div>
      </div>

      <!-- Tab Ghi chú nhanh -->
      <div class="detail-panel" id="panel-notes">
        <div class="section">
          <div class="pd-note">
            <div class="pd-note-title">📝 Thêm ghi chú mới</div>
            <select>
              <option value="">-- Chọn trạng thái cuộc gọi/tương tác --</option>
              <option>Không kết nối</option>
              <option>Đang tư vấn</option>
              <option>Hẹn gọi lại</option>
              <option>Cơ hội</option>
              <option>Chốt thành công</option>
              <option>Nguy cơ rời bỏ</option>
            </select>
            <textarea rows="3" placeholder="Nhập ghi chú về cuộc gọi, gặp mặt, nhu cầu khách hàng..."></textarea>
            <button class="pd-note-submit" disabled>⊕ Thêm ghi chú</button>
          </div>
          <div id="notesList"></div>
          <div class="empty-line" id="notesEmpty">Chưa có ghi chú nào.</div>
        </div>
      </div>

      <!-- Tab Tạo đơn (logic theo CRM/tao-don.html) -->
      <div class="detail-panel" id="panel-order">
        <div class="of">
          <div class="of__section-title">Thông tin đơn hàng</div>
          <div class="of__row">
            <div class="of__group">
              <label class="of__label">Chọn trạng thái</label>
              <div class="of__select-wrap">
                <select class="of__select of__select--accent">
                  <option value="">-- Chọn trạng thái --</option>
                  <option>Chờ xử lý</option>
                  <option selected>Đang lấy hàng</option>
                  <option>Chờ lấy lại</option>
                  <option>Đã lấy hàng</option>
                  <option>Đang giao hàng</option>
                  <option>Chờ giao lại</option>
                  <option>Giao thành công</option>
                  <option>Chờ chuyển hoàn</option>
                  <option>Đang chuyển hoàn</option>
                  <option>Chờ chuyển hoàn lại</option>
                  <option>Đã chuyển hoàn</option>
                  <option>Đã hủy</option>
                </select>
              </div>
            </div>
            <div class="of__group">
              <label class="of__label">Chọn nhân viên</label>
              <div class="of__select-wrap">
                <select class="of__select">
                  <option value="" selected>Chọn nhân viên</option>
                  <option>Lộc Thị Hạnh</option>
                  <option>Ngọc Thảo</option>
                  <option>Tuấn Anh Đỗ</option>
                </select>
              </div>
            </div>
          </div>
          <div class="of__group">
            <label class="of__label">📍 Tỉnh/Thành phố</label>
            <div class="of__select-wrap">
              <select class="of__select">
                <option value="" selected>Chọn tỉnh/thành phố</option>
                <option>Hà Nội</option>
                <option>TP. Hồ Chí Minh</option>
                <option>Đà Nẵng</option>
                <option>Hải Phòng</option>
                <option>Hưng Yên</option>
              </select>
            </div>
          </div>
          <div class="of__group">
            <label class="of__label">📍 Phường/Xã</label>
            <div class="of__select-wrap">
              <select class="of__select"><option value="" selected>Chọn phường/xã</option></select>
            </div>
          </div>
          <div class="of__group">
            <label class="of__label">Địa chỉ chi tiết</label>
            <input class="of__input" placeholder="Điền địa chỉ chi tiết...">
          </div>

          <div class="of__section-title">Thông tin khác</div>
          <div class="of__row">
            <div class="of__group">
              <label class="of__label">Nguồn đơn hàng</label>
              <div class="of__select-wrap">
                <select class="of__select">
                  <option value="" selected>Chọn nguồn</option>
                  <option>Zalo</option><option>Facebook</option><option>Website</option><option>Hotline</option>
                </select>
              </div>
            </div>
            <div class="of__group">
              <label class="of__label">Loại đơn hàng</label>
              <div class="of__select-wrap">
                <select class="of__select">
                  <option value="" selected>Chọn loại</option>
                  <option>Bán lẻ</option><option>Bán buôn</option><option>Đơn mẫu</option>
                </select>
              </div>
            </div>
          </div>
          <div class="of__group">
            <label class="of__label">Ghi chú</label>
            <textarea class="of__textarea" id="ofOrderNote" placeholder="Nhập ghi chú đơn hàng..."></textarea>
          </div>

          <div class="of__section-title">Sản phẩm</div>
          <div class="of__row">
            <div class="of__group" style="flex:0 0 82px;">
              <div class="of__select-wrap">
                <select class="of__select" title="Chọn kho hàng">
                  <option value="" selected>Kho</option>
                  <option>Kho Hà Nội</option>
                  <option>Kho HCM</option>
                </select>
              </div>
            </div>
            <div class="of__group"><input class="of__input" placeholder="Tìm sản phẩm"></div>
            <div class="of__group"><input class="of__input" placeholder="Tìm quà tặng"></div>
          </div>
          <div class="of__prod-head"><span>Sản phẩm</span><span>Giá tiền</span></div>
          <div id="ofProdList">
            <div class="op-item" data-gia="87000" data-kl="100" data-ton="770">
              <div class="op-item__top">
                <span class="op-item__code">FX/TP-CC05-100/KR</span>
                <button type="button" class="op-item__del" title="Xoá sản phẩm">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
              <div class="op-item__name">Vạn Thọ Trà - Túi Kraft 100g · Đã có VAT 8%</div>
              <div class="op-item__row">
                <span>87.000 đ/Túi · <i class="op-item__kl">100g</i></span>
                <div class="op-qty"><button type="button" data-d="-1">−</button><input value="1" inputmode="numeric"><button type="button" data-d="1">+</button></div>
              </div>
              <div class="op-item__row"><span class="op-item__stock">Tồn: 770</span><b class="op-item__sum">87.000</b></div>
            </div>
            <div class="op-item" data-gia="500000" data-kl="100" data-ton="527">
              <div class="op-item__top">
                <span class="op-item__code">FX/TP-CC09-100/KR</span>
                <button type="button" class="op-item__del" title="Xoá sản phẩm">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
              <div class="op-item__name">Trà Đinh Ngọc - Túi thiếc VIP - 100g · Đã có VAT 8%</div>
              <div class="op-item__row">
                <span>500.000 đ/Hộp · <i class="op-item__kl">100g</i></span>
                <div class="op-qty"><button type="button" data-d="-1">−</button><input value="1" inputmode="numeric"><button type="button" data-d="1">+</button></div>
              </div>
              <div class="op-item__row"><span class="op-item__stock">Tồn: 527</span><b class="op-item__sum">500.000</b></div>
            </div>
            <div class="op-item op-item--gift" data-gia="0" data-kl="250" data-ton="120">
              <div class="op-item__top">
                <span class="op-item__code">QT/CL-MC-250</span>
                <span class="op-gift-tag">🎁 Quà tặng</span>
                <button type="button" class="op-item__del" title="Xoá quà tặng">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
              <div class="op-item__name">Chè lam matcha - 250g · Quà tặng — không tính tiền</div>
              <div class="op-item__row">
                <span>0 đ/Gói · <i class="op-item__kl">250g</i></span>
                <div class="op-qty"><button type="button" data-d="-1">−</button><input value="1" inputmode="numeric"><button type="button" data-d="1">+</button></div>
              </div>
              <div class="op-item__row"><span class="op-item__stock">Tồn: 120</span><b class="op-item__sum">0</b></div>
            </div>
          </div>
          <div class="of__prod-empty" id="ofProdEmpty" hidden>🔍 Chưa có sản phẩm nào</div>
          <div class="op-total" id="ofProdTotal"></div>

          <div class="of__summary">
            <div class="of__head-row" style="margin-bottom:10px;">
              <div class="of__section-title" style="margin:0;">Vận chuyển</div>
              <label class="of-check"><input type="checkbox" id="ofSelfShip"> Tự vận chuyển</label>
            </div>
            <div class="of__group">
              <label class="of__label">🚚 Chọn đơn vị vận chuyển</label>
              <div class="of__select-wrap">
                <select class="of__select" id="ofShipUnit">
                  <option data-fee="25000" data-info="J&amp;T Express - Chuyển phát nhanh chuyên nghiệp" selected>J&amp;T Express - 25.000đ</option>
                  <option data-fee="25000" data-info="VN Post - Mạng lưới bưu cục phủ khắp toàn quốc">VN Post - 25.000đ</option>
                  <option data-fee="25000" data-info="Viettel Post - Chuyển phát nhanh trong ngày nội tỉnh">Viettel Post - 25.000đ</option>
                </select>
              </div>
            </div>
            <div class="of__group">
              <label class="of__label" id="ofShipCostLabel">Chi phí vận chuyển</label>
              <input class="of__input" id="ofShipCost" value="25.000" disabled>
            </div>
            <div class="of__info" id="ofShipInfo">ⓘ <b>Thông tin:</b> J&amp;T Express - Chuyển phát nhanh chuyên nghiệp</div>
            <label class="of-check" style="margin-bottom:8px;"><input type="checkbox"> Hàng dễ vỡ ⓘ</label>
            <div class="of__dim-grid">
              <input class="of__input" id="ofShipWeight" value="450" title="KL (gram) — tự điền theo tổng KL, sửa tay được">
              <input class="of__input" placeholder="Dài (cm)">
              <input class="of__input" placeholder="Rộng (cm)">
              <input class="of__input" placeholder="Cao (cm)">
            </div>
            <div class="of__return-note" id="ofReturnNote">Ghi chú đơn đổi: Thu hàng cũ đổi đơn mới &amp; thu cod chênh lệch</div>
            <div class="of__head-row" style="margin-top:10px;">
              <span style="font-size:12.5px; font-weight:700;" id="ofShipBrand">J&amp;T EXPRESS</span>
              <label class="of-check"><input type="checkbox" id="ofReturnCheck"> Đơn đổi trả</label>
            </div>
          </div>

          <div class="of__summary">
            <div class="of__head-row" style="margin-bottom:4px;">
              <div class="of__section-title" style="margin:0;">Thanh toán</div>
              <span style="color:var(--primary-500); display:flex;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>
              </span>
            </div>
            <div class="of__sum-row">
              <span class="of__sum-label">Chiết khấu</span>
              <span class="of__unit-input"><input id="ofDiscount" value="0" inputmode="numeric"><i>%</i></span>
            </div>
            <div class="of__sum-row">
              <span class="of__sum-label">Mã ưu đãi</span>
              <span class="of__code-input"><input placeholder="Nhập mã"><button>Áp dụng</button></span>
            </div>
            <div class="of__sum-row">
              <span class="of__sum-label">Tiêu "Lá"<em>1 Lá = 1.000đ</em></span>
              <span class="of__unit-input"><input id="ofPoints" value="0" inputmode="numeric"><i>Lá</i></span>
            </div>
            <div class="of__sum-row"><span class="of__sum-label">Quy đổi Lá</span><span class="of__sum-value" id="ofLaMoney">0đ</span></div>
            <div class="of__sum-row"><span class="of__sum-label">Phí vận chuyển</span><span class="of__sum-value" id="ofPayShip">25.000đ</span></div>
            <div class="of__total-row"><span>Tổng thanh toán</span><b id="ofPayTotal">612.000</b></div>
            <div class="of__sum-row">
              <span class="of__sum-label">Chuyển khoản (đặt cọc)</span>
              <span class="of__unit-input"><input id="ofTransfer" value="0" inputmode="numeric" placeholder="0"><i>đ</i></span>
            </div>
            <div class="of__sum-row"><span class="of__sum-label">Đã đặt cọc</span><span class="of__sum-value" style="color:#16a34a;" id="ofDeposit">0đ</span></div>
            <div class="of__sum-row"><span class="of__sum-label">Còn phải thu (COD)</span><span class="of__sum-value" style="color:#ea580c;" id="ofPayCod">612.000đ</span></div>
            <div class="of__sum-row"><span class="of__sum-label">Trạng thái thanh toán</span><span class="of__pay-badge" id="ofPayStatus">Chưa thanh toán</span></div>
          </div>

          <div class="of__footer">
            <button class="of__btn-reset">↺ Tạo lại</button>
            <button class="of__btn-submit" id="ofSubmit">🛒 Đặt hàng</button>
          </div>
        </div>
      </div>

      <!-- Tab Tài liệu bán hàng -->
      <div class="detail-panel" id="panel-sales">
        <div class="sd">
          <div class="sd__tabs">
            <button class="sd__tab sd__tab--active" data-sd="images">Hình ảnh</button>
            <button class="sd__tab" data-sd="content">Content</button>
            <button class="sd__tab" data-sd="video">Video</button>
          </div>
          <div class="sd__note">🔒 Chỉ hiển thị tài liệu <b>đã duyệt</b> — được phép gửi ra ngoài cho khách.</div>

          <div class="sd__panel sd__panel--active" id="sd-images">
            <div class="search-input sd__search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
              <input placeholder="Tìm ảnh theo tên, mã...">
            </div>
            <div class="sd__group">🍵 Trà Đinh Ngọc</div>
            <div class="sd__grid">
              <label class="sd-tile" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);">
                <input type="checkbox" data-name="Đinh Ngọc 100g" data-code="FX/TP-CC09-100/KR" title="Mã: FX/TP-CC09-100/KR">
                <span class="sd-tile__emoji">🍵</span><span class="sd-tile__name">Đinh Ngọc 100g</span>
              </label>
              <label class="sd-tile" style="background:linear-gradient(135deg,#e0f2fe,#bae6fd);">
                <input type="checkbox" data-name="Hộp thiếc VIP" data-code="FX/TP-CC09-HT" title="Mã: FX/TP-CC09-HT">
                <span class="sd-tile__emoji">📦</span><span class="sd-tile__name">Hộp thiếc VIP</span>
              </label>
              <label class="sd-tile" style="background:linear-gradient(135deg,#fef3c7,#fde68a);">
                <input type="checkbox" data-name="Set quà biếu" data-code="QT/SET-SN08" title="Mã: QT/SET-SN08">
                <span class="sd-tile__emoji">🎁</span><span class="sd-tile__name">Set quà biếu</span>
              </label>
            </div>
            <div class="sd__group">🏔️ Trà Shan Tuyết</div>
            <div class="sd__grid">
              <label class="sd-tile" style="background:linear-gradient(135deg,#f3e8ff,#e9d5ff);">
                <input type="checkbox" data-name="Shan Tuyết cổ thụ" data-code="ST/CT-500" title="Mã: ST/CT-500">
                <span class="sd-tile__emoji">🏔️</span><span class="sd-tile__name">Shan Tuyết cổ thụ</span>
              </label>
              <label class="sd-tile" style="background:linear-gradient(135deg,#dcfce7,#a7f3d0);">
                <input type="checkbox" data-name="Hồng trà Shan" data-code="ST/HT-80" title="Mã: ST/HT-80">
                <span class="sd-tile__emoji">🍃</span><span class="sd-tile__name">Hồng trà Shan</span>
              </label>
            </div>
            <div class="sd__group">🫖 Ấm chén &amp; phụ kiện</div>
            <div class="sd__grid">
              <label class="sd-tile" style="background:linear-gradient(135deg,#fce7f3,#fbcfe8);">
                <input type="checkbox" data-name="Bộ ấm Cúc cổ" data-code="PK/AC-CC09" title="Mã: PK/AC-CC09">
                <span class="sd-tile__emoji">🫖</span><span class="sd-tile__name">Bộ ấm Cúc cổ</span>
              </label>
              <label class="sd-tile" style="background:linear-gradient(135deg,#ffedd5,#fed7aa);">
                <input type="checkbox" data-name="Chén khải sứ" data-code="PK/CK-01" title="Mã: PK/CK-01">
                <span class="sd-tile__emoji">☕</span><span class="sd-tile__name">Chén khải sứ</span>
              </label>
            </div>
            <div class="empty-line sd__empty" hidden>Không tìm thấy tài liệu phù hợp.</div>
            <div class="sd__send-wrap">
              <button class="sd__send-btn" data-send="sd-images" disabled>📤 Gửi vào chat (0)</button>
            </div>
          </div>

          <div class="sd__panel" id="sd-content">
            <div class="search-input sd__search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
              <input placeholder="Tìm content theo tên, mã...">
            </div>
            <div class="sd-content">
              <div class="sd-content__head">
                <div class="sd-content__title">Trà Đinh Ngọc — Túi thiếc VIP 100g <span class="sd-content__code">CT-DN-01</span></div>
                <button class="sd-content__copy">📋 Copy</button>
              </div>
              <div class="sd-content__text">🍵 TRÀ ĐINH NGỌC — phẩm trà thượng hạng của Trà Dược Việt Nam. Hái 1 tôm duy nhất lúc sớm mai, sao suốt bằng chảo gang. Nước xanh ngọc, hương cốm non, hậu ngọt sâu. Hộp thiếc VIP 100g — sang trọng để biếu tặng. Inbox để được tư vấn ngay ạ! 🌿</div>
            </div>
            <div class="sd-content">
              <div class="sd-content__head">
                <div class="sd-content__title">Trà Shan Tuyết cổ thụ <span class="sd-content__code">CT-ST-01</span></div>
                <button class="sd-content__copy">📋 Copy</button>
              </div>
              <div class="sd-content__text">🏔️ SHAN TUYẾT CỔ THỤ — thu hái từ những cây trà trăm tuổi trên độ cao 1.400m. Búp trà phủ tuyết trắng, vị chát dịu chuyển ngọt, pha được 7-8 nước vẫn đượm hương. Món quà từ núi rừng cho người sành trà. 🍃</div>
            </div>
            <div class="sd-content">
              <div class="sd-content__head">
                <div class="sd-content__title">Combo quà biếu sinh nhật <span class="sd-content__code">CT-SN-08</span></div>
                <button class="sd-content__copy">📋 Copy</button>
              </div>
              <div class="sd-content__text">🎂 Sinh nhật tháng này — TDVN gửi tặng ưu đãi đặc biệt: Combo Trà Đinh Ngọc 100g + hộp kẹo vừng ta + thiệp chúc mừng viết tay. Miễn phí gói quà &amp; giao hàng. Nhắn em để giữ ưu đãi nhé ạ! 🎁</div>
            </div>
            <div class="empty-line sd__empty" hidden>Không tìm thấy tài liệu phù hợp.</div>
          </div>

          <div class="sd__panel" id="sd-video">
            <div class="search-input sd__search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
              <input placeholder="Tìm video theo tên, mã...">
            </div>
            <div class="sd__group">🍵 Trà Đinh Ngọc</div>
            <div class="sd__grid">
              <label class="sd-tile" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);">
                <input type="checkbox" data-name="Review Đinh Ngọc" data-code="VD-DN-REVIEW" title="Mã: VD-DN-REVIEW">
                <span class="sd-tile__emoji">🎬</span><span class="sd-tile__name">Review Đinh Ngọc</span>
                <span class="sd-tile__dur">▶ 1:25</span>
              </label>
              <label class="sd-tile" style="background:linear-gradient(135deg,#e0f2fe,#bae6fd);">
                <input type="checkbox" data-name="Cách pha Đinh Ngọc" data-code="VD-DN-PHA" title="Mã: VD-DN-PHA">
                <span class="sd-tile__emoji">🫖</span><span class="sd-tile__name">Cách pha chuẩn</span>
                <span class="sd-tile__dur">▶ 0:58</span>
              </label>
            </div>
            <div class="sd__group">🏭 Thương hiệu</div>
            <div class="sd__grid">
              <label class="sd-tile" style="background:linear-gradient(135deg,#f3e8ff,#e9d5ff);">
                <input type="checkbox" data-name="Xưởng trà TDVN" data-code="VD-BRAND-01" title="Mã: VD-BRAND-01">
                <span class="sd-tile__emoji">🏭</span><span class="sd-tile__name">Xưởng trà TDVN</span>
                <span class="sd-tile__dur">▶ 2:10</span>
              </label>
            </div>
            <div class="empty-line sd__empty" hidden>Không tìm thấy tài liệu phù hợp.</div>
            <div class="sd__send-wrap">
              <button class="sd__send-btn" data-send="sd-video" disabled>📤 Gửi vào chat (0)</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ========== MÀN 4: KHO LƯU TRỮ ========== -->
  <div class="view" id="view-library">
    <div class="appbar">
      <button class="appbar__back" data-nav-back>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div class="appbar__title" style="text-align:center;">Kho lưu trữ</div>
      <button class="appbar__btn" style="width:auto; font-size:14px; font-weight:700; color:var(--gray-800);">Chọn</button>
    </div>
    <div class="lib">
      <div class="lib__tabs">
        <button class="lib__tab" data-lib="media">Ảnh/Video</button>
        <button class="lib__tab lib__tab--active" data-lib="files">Files</button>
        <button class="lib__tab" data-lib="links">Links</button>
      </div>

      <div class="lib__panel" id="lib-media">
        <div class="lib__filters">
          <button class="lib__chip">Người gửi ⌄</button>
          <button class="lib__chip">Ngày gửi ⌄</button>
        </div>
        <div class="lib__date">Ngày 18 Tháng 8</div>
        <div class="lib__grid">
          <div class="lib__tile" style="background:linear-gradient(135deg,#fef3c7,#fde68a);">🎂</div>
          <div class="lib__tile" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);">🍵</div>
          <div class="lib__tile" style="background:linear-gradient(135deg,#e0f2fe,#bae6fd);">📦<span class="lib__tile-dur">▶ 0:35</span></div>
        </div>
        <div class="lib__date">Ngày 13 Tháng 6</div>
        <div class="lib__grid">
          <div class="lib__tile" style="background:linear-gradient(135deg,#fce7f3,#fbcfe8);">🏷️</div>
          <div class="lib__tile" style="background:linear-gradient(135deg,#f3e8ff,#e9d5ff);">🚚</div>
        </div>
      </div>

      <div class="lib__panel lib__panel--active" id="lib-files">
        <div class="search-input">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input placeholder="Tìm kiếm File">
        </div>
        <div class="lib__filters">
          <button class="lib__chip">Loại ⌄</button>
          <button class="lib__chip">Người gửi ⌄</button>
          <button class="lib__chip">Ngày gửi ⌄</button>
        </div>
        <div class="lib__date">Ngày 14 Tháng 8</div>
        <div class="lib__file">
          <span class="lib__file-ic" style="background:#16a34a;">XLS</span>
          <div class="lib__body"><div class="lib__file-name">Bảng giá sỉ TDVN T8-2026.xlsx</div><div class="lib__file-meta">128 KB · Lộc Hạnh</div></div>
        </div>
        <div class="lib__file">
          <span class="lib__file-ic" style="background:#2563eb;">DOC</span>
          <div class="lib__body"><div class="lib__file-name">Mẫu hợp đồng đại lý 2026.docx</div><div class="lib__file-meta">84 KB · Lộc Hạnh</div></div>
        </div>
        <div class="lib__date">Ngày 12 Tháng 8</div>
        <div class="lib__file">
          <span class="lib__file-ic" style="background:#ef4444;">PDF</span>
          <div class="lib__body"><div class="lib__file-name">Phiếu giao J&amp;T 802802916652.pdf</div><div class="lib__file-meta">312 KB · Thủy Anna</div></div>
        </div>
        <div class="lib__date">Ngày 5 Tháng 8</div>
        <div class="lib__file">
          <span class="lib__file-ic" style="background:#ef4444;">PDF</span>
          <div class="lib__body"><div class="lib__file-name">Catalogue Trà Đinh Ngọc.pdf</div><div class="lib__file-meta">2,4 MB · Ngọc Thảo</div></div>
        </div>
      </div>

      <div class="lib__panel" id="lib-links">
        <div class="search-input">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input placeholder="Tìm kiếm link">
        </div>
        <div class="lib__filters">
          <button class="lib__chip">Người gửi ⌄</button>
          <button class="lib__chip">Ngày gửi ⌄</button>
        </div>
        <div class="lib__date">Ngày 14 Tháng 8</div>
        <div class="lib__link">
          <span class="lib__link-ic">🔗</span>
          <div class="lib__body"><div class="lib__link-title">Ảnh mẫu bao bì Tết 2027 (Drive)</div><div class="lib__link-domain">drive.google.com</div></div>
        </div>
        <div class="lib__date">Ngày 12 Tháng 8</div>
        <div class="lib__link">
          <span class="lib__link-ic">🔗</span>
          <div class="lib__body"><div class="lib__link-title">Bảng giá đại lý T8 — Google Sheets</div><div class="lib__link-domain">docs.google.com</div></div>
        </div>
        <div class="lib__date">Ngày 11 Tháng 8</div>
        <div class="lib__link">
          <span class="lib__link-ic">🔗</span>
          <div class="lib__body"><div class="lib__link-title">Trà Đinh Ngọc - Túi thiếc VIP 100g</div><div class="lib__link-domain">traduocvietnam.vn</div></div>
        </div>
        <div class="lib__date">Ngày 10 Tháng 8</div>
        <div class="lib__link">
          <span class="lib__link-ic">🔗</span>
          <div class="lib__body"><div class="lib__link-title">Tra cứu vận đơn J&amp;T Express</div><div class="lib__link-domain">jtexpress.vn</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ========== MÀN 5: LỊCH SỬ MUA HÀNG ========== -->
  <div class="view" id="view-history">
    <div class="appbar">
      <button class="appbar__back" data-nav-back>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div class="appbar__title">Lịch sử mua hàng</div>
    </div>
    <div style="flex:1; overflow-y:auto;">
      <div class="ph-row">
        <span class="ph-row__ic">🧾</span>
        <div><div class="ph-row__name">HD_L255I019</div><div class="ph-row__meta">23/07/2026 · Trà Đinh Ngọc - Túi thiếc VIP 100g</div></div>
        <div class="ph-row__right"><div class="ph-row__money">2.500.000đ</div><span class="ph-badge ph-badge--done">Giao thành công</span></div>
      </div>
      <div class="ph-row">
        <span class="ph-row__ic">🧾</span>
        <div><div class="ph-row__name">HD_1953X82A</div><div class="ph-row__meta">06/07/2026 · Trà Đinh Ngọc - Túi thiếc VIP 100g</div></div>
        <div class="ph-row__right"><div class="ph-row__money">2.500.000đ</div><span class="ph-badge ph-badge--done">Giao thành công</span></div>
      </div>
      <div class="ph-row">
        <span class="ph-row__ic">🧾</span>
        <div><div class="ph-row__name">HD_49763P4R</div><div class="ph-row__meta">01/07/2026 · (Quà) Kẹo Vừng Ta + Đinh Ngọc 100g</div></div>
        <div class="ph-row__right"><div class="ph-row__money">2.500.000đ</div><span class="ph-badge ph-badge--return">Đã chuyển hoàn</span></div>
      </div>
      <div class="ph-row">
        <span class="ph-row__ic">🧾</span>
        <div><div class="ph-row__name">HD_5377O2V4</div><div class="ph-row__meta">21/01/2026 · (Quà) Kẹo lạc đỏ + Đinh Ngọc 100g</div></div>
        <div class="ph-row__right"><div class="ph-row__money">2.500.000đ</div><span class="ph-badge ph-badge--cancel">Đã hủy</span></div>
      </div>
      <div class="ph-row">
        <span class="ph-row__ic">🧾</span>
        <div><div class="ph-row__name">HD021279</div><div class="ph-row__meta">16/12/2025 · (Quà) Kẹo vừng ta + Đinh Ngọc 100g</div></div>
        <div class="ph-row__right"><div class="ph-row__money">2.500.000đ</div><span class="ph-badge ph-badge--done">Giao thành công</span></div>
      </div>
      <div class="empty-line" style="padding:0 14px 20px;">Bản mobile hiển thị rút gọn — xem đầy đủ trên CRM desktop.</div>
    </div>
  </div>

  <!-- ===== Bottom sheet: Thêm liên hệ mới ===== -->
  <div class="sheet-bg" id="addCustSheet">
    <div class="sheet">
      <div class="sheet__head">
        <div>
          <div class="sheet__title">Thêm liên hệ mới</div>
          <div class="sheet__sub">Nhập thông tin để tạo liên hệ trong hệ thống</div>
        </div>
        <button class="sheet__close" id="addCustClose">✕</button>
      </div>
      <div class="sheet__body">
        <div class="fld">
          <label class="fld__label">👤 Họ và tên <span class="fld__req">*</span></label>
          <input class="fld__input" placeholder="Nhập tên liên hệ">
        </div>
        <div class="fld-row">
          <div class="fld"><label class="fld__label">📞 Số điện thoại</label><input class="fld__input" placeholder="0912 345 678"></div>
          <div class="fld"><label class="fld__label">✉️ Email</label><input class="fld__input" type="email" placeholder="email@example.com"></div>
        </div>
        <div class="fld"><label class="fld__label">🏢 Công ty</label><input class="fld__input" placeholder="Tìm công ty (nếu có)..."></div>
        <div class="fld-row">
          <div class="fld"><label class="fld__label">🌐 Nguồn</label>
            <select class="fld__select"><option>Zalo</option><option>Facebook</option><option>Website</option><option>LinkedIn</option><option>AI Bot</option><option>Giới thiệu</option><option>Khác</option></select>
          </div>
          <div class="fld"><label class="fld__label">🔀 Giai đoạn</label>
            <select class="fld__select"><option>Đăng ký</option><option>Lead</option><option>Đủ điều kiện</option><option>Cơ hội</option><option>Khách hàng</option><option>VIP/Đại sứ</option><option>Rời bỏ</option></select>
          </div>
        </div>
        <div class="fld"><label class="fld__label">🏷️ Nhãn / Tags</label><input class="fld__input" placeholder="VIP, Tiềm năng, Hot..."></div>
        <div class="fld"><label class="fld__label">📝 Ghi chú nội bộ</label><textarea class="fld__textarea" placeholder="Thêm ghi chú về liên hệ..."></textarea></div>
      </div>
      <div class="sheet__foot">
        <button class="sheet-btn sheet-btn--ghost" id="addCustCancel">Hủy</button>
        <button class="sheet-btn sheet-btn--primary" id="addCustSubmit">＋ Tạo liên hệ</button>
      </div>
    </div>
  </div>

  <!-- ===== Modal AI (bottom sheet) ===== -->
  <div class="ai-modal-bg" id="aiModalBg">
    <div class="ai-modal">
      <div class="ai-modal__head">
        ✨ Customer 360 — Phân tích khách hàng
        <button class="ai-modal__close" id="aiModalClose">✕</button>
      </div>
      <div class="ai-modal__body">
        <div class="ai-loading" id="aiLoading"><span class="ai-spinner"></span> Đang phân tích cuộc trò chuyện gần nhất...</div>
        <div id="aiResult" hidden>
          <div class="ai-block">
            <div class="ai-block__title">👤 Chân dung khách hàng</div>
            Khách mới từ Zalo cá nhân (kênh Vận Đơn TDVN), pipeline <b>Đăng ký</b>, Lead 0/100. Hôm nay là <b>sinh nhật khách (18/08)</b>.
          </div>
          <div class="ai-block">
            <div class="ai-block__title">💬 Tóm tắt hội thoại</div>
            Shop gửi 1 ảnh (13/06), hệ thống vừa gửi thiệp sinh nhật hôm nay. Khách <b>chưa phản hồi</b> — chưa rõ nhu cầu cụ thể.
          </div>
          <div class="ai-block">
            <div class="ai-block__title">🎯 Cơ hội</div>
            Sinh nhật là cớ tự nhiên để mở lại hội thoại. Tiềm năng chuyển <b>Đăng ký → Lead</b> nếu khách phản hồi lời chúc.
          </div>
          <div class="ai-block">
            <div class="ai-block__title">✅ Đề xuất hành động</div>
            1. Gửi lời chúc sinh nhật cá nhân hoá kèm ảnh thiệp.<br>
            2. Tặng mã ưu đãi sinh nhật (hạn 7 ngày) để tạo lý do mua.<br>
            3. Nếu khách phản hồi — giới thiệu Trà Đinh Ngọc bản dùng thử 100g.
          </div>
          <div class="ai-modal__time" id="aiTime">Lượt phân tích gần nhất: —</div>
        </div>
      </div>
      <div class="ai-modal__foot">
        <button class="ai-btn-ghost" id="aiModalClose2">Đóng</button>
        <button class="ai-btn-note" id="btnAiToNote" disabled>✏️ Ghi vào ghi chú</button>
      </div>
    </div>
  </div>`,pi=`// Hành vi DEMO tách nguyên trạng từ bản mẫu: điều hướng, tab, tính tiền form đơn.
// Các đợt sau sẽ thay dần từng phần bằng dữ liệu API thật; phần chưa thay vẫn
// chạy như mẫu để app luôn bấm được đủ màn hình.
// ================== ĐIỀU HƯỚNG MÀN ==================
  var navStack = [];
  function navOpen(id){
    document.getElementById(id).classList.add('view--open');
    navStack.push(id);
  }
  function navBack(){
    var id = navStack.pop();
    if (id) document.getElementById(id).classList.remove('view--open');
  }
  document.querySelectorAll('[data-nav-back]').forEach(function(b){ b.addEventListener('click', navBack); });

  // ================== ĐIỀU HƯỚNG CẤP 1: bottom tab bar (Tổng quan / Hội thoại / Cài đặt) ==================
  function homeSwitch(key){
    document.querySelectorAll('.home-panel').forEach(function(p){
      p.classList.toggle('home-panel--active', p.id === 'home-' + key);
    });
    document.querySelectorAll('.bottomnav__item').forEach(function(t){
      t.classList.toggle('bottomnav__item--active', t.dataset.home === key);
    });
  }
  document.querySelectorAll('.bottomnav__item').forEach(function(btn){
    btn.addEventListener('click', function(){ if (btn.dataset.home) homeSwitch(btn.dataset.home); });
  });
  // ---- Dashboard Tổng quan: biểu đồ tin nhắn, pipeline, hoạt động ----
  // Bar chart tin nhắn theo ngày (7 ngày) — cặp Đã gửi / Đã nhận
  var BAR_DAYS = [
    {d:'T2', sent:520, recv:470}, {d:'T3', sent:610, recv:560}, {d:'T4', sent:480, recv:430},
    {d:'T5', sent:700, recv:640}, {d:'T6', sent:590, recv:520}, {d:'T7', sent:430, recv:390},
    {d:'CN', sent:303, recv:280}
  ];
  var barMax = 0;
  BAR_DAYS.forEach(function(x){ barMax = Math.max(barMax, x.sent, x.recv); });
  document.getElementById('barChart').innerHTML = BAR_DAYS.map(function(x){
    return '<div class="bar-col"><div class="bar-col__bars">' +
      '<div class="bar-col__bar" style="height:' + Math.round(x.sent / barMax * 100) + '%; background:#3b82f6;"></div>' +
      '<div class="bar-col__bar" style="height:' + Math.round(x.recv / barMax * 100) + '%; background:#93c5fd;"></div>' +
      '</div><div class="bar-col__label">' + x.d + '</div></div>';
  }).join('');

  // Pipeline khách hàng
  var PIPELINE = [
    {name:'Khách hàng', color:'#16a34a', value:4},
    {name:'mql', color:'#94a3b8', value:1},
    {name:'Cơ hội', color:'#ea580c', value:2},
    {name:'Lead', color:'#f59e0b', value:7},
    {name:'Đủ điều kiện', color:'#9333ea', value:2},
    {name:'Đăng ký', color:'#2563eb', value:13335}
  ];
  var plMax = Math.max.apply(null, PIPELINE.map(function(p){ return p.value; }));
  document.getElementById('pipeline').innerHTML = PIPELINE.map(function(p){
    return '<div class="pl-bar">' +
      '<span class="pl-bar__label"><span class="pl-bar__dot" style="background:' + p.color + ';"></span>' + p.name + '</span>' +
      '<span class="pl-bar__track"><span class="pl-bar__fill" style="width:' + (p.value / plMax * 100) + '%; background:' + p.color + ';"></span></span>' +
      '<span class="pl-bar__value">' + p.value.toLocaleString('vi-VN') + '</span></div>';
  }).join('');

  // Hoạt động gần đây
  var ACTIVITY = ['Aaa','Chu Đức Tuấn','Lân Ngãi','Nguyen Van Toj','Đào Văn Hưng','Thành Thu','Trần Sang','Do Quang','Le Quoc Viet','Nguyễn Văn Phòng'];
  function initials(name){
    var p = name.trim().split(/\\s+/);
    return (p.length > 1 ? p[0].charAt(0) + p[p.length - 1].charAt(0) : p[0].charAt(0)).toUpperCase();
  }
  document.getElementById('activityFeed').innerHTML = ACTIVITY.map(function(n){
    return '<div class="act-item"><div class="act-item__avatar">' + esc(initials(n)) + '</div>' +
      '<div class="act-item__text"><b>' + esc(n) + '</b> chuyển sang "subscriber"</div>' +
      '<span class="act-item__time">1 phút trước</span></div>';
  }).join('');

  // ================== DANH SÁCH HỘI THOẠI ==================
  var SRC_VD = 'Vận Đơn Trà Dược Việt Nam - 0325173345';
  var SRC_LH = 'Lộc Hạnh Trà Dược Việt Nam';
  var CONVS = [
    {init:'KV', color:'#ec4899', name:'Kd Vanhoa 0348302234', time:'5h', cake:'Ks Văn Hóa', src:SRC_VD},
    {init:'T-', color:'#ec4899', name:'TDVN - JT CARE ĐƠN HÀNG', time:'1d', text:'@Thủy Anna check hành trình đơn này giúp chị với. 802802916652 Đã đến bưu cục phát chưa?', src:SRC_VD},
    {init:'NT', color:'#9333ea', name:'Ngọc Thảo Trà Dược Việt Nam', time:'1d', cake:'Ngọc Thảo Trà Dược Việt Nam', src:SRC_VD, unread:2},
    {init:'T-', color:'#16a34a', name:'TDVN - VIETTEL POST CARE ĐƠN HÀNG', time:'3d', img:true, src:SRC_VD, unread:4},
    {init:'H',  color:'#ef4444', name:'Hb', time:'5d', text:'mùng 1 đầu tháng chúc CH buôn may bán đắt /-rose', src:SRC_LH},
    {init:'PK', color:'#ec4899', name:'Phòng KDPTTT tháng 72026', time:'5d', text:'@Tuấn Anh Đỗ Ok em. chị nhận thông tin liên hệ trao đổi lại với khách.', src:SRC_LH},
    {init:'LH', color:'#0ea5e9', name:'Lộc Hạnh Trà Dược Việt Nam', time:'5d', img:true, src:SRC_LH},
    {init:'MS', color:'#9333ea', name:'Mộc Sơn', time:'5d', img:true, src:SRC_LH, unread:1},
    {init:'NP', color:'#8b5cf6', name:'Nam Phong 0983281986', time:'5d', img:true, src:SRC_LH},
    {init:'NN', color:'#16a34a', name:'Nam Nguyen', time:'5d', img:true, src:SRC_LH},
    {init:'NH', color:'#f59e0b', name:'Nam Hoai', time:'5d', img:true, src:SRC_LH},
    {init:'NC', color:'#16a34a', name:'Nam Cuong 0911127166', time:'5d', img:true, src:SRC_LH},
    {init:'AT', color:'#3b82f6', name:'Anh Trường Hưng Yên 0786363363', time:'5d', img:true, src:SRC_LH},
    {init:'ML', color:'#0ea5e9', name:'Mỹ Linh 0933305238', time:'5d', img:true, src:SRC_LH}
  ];
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function preview(c){
    if (c.cake) return '<span style="color:#f97316;">🎂 Sinh nhật: ' + esc(c.cake) + '</span>';
    if (c.img)  return '<span style="color:#3b82f6;">📷 Hình ảnh</span>';
    return esc(c.text || '');
  }
  document.getElementById('convList').innerHTML = CONVS.map(function(c, i){
    return '<div class="conv-item" data-i="' + i + '">' +
      '<div class="conv-item__avatar" style="background:' + c.color + ';">' + esc(c.init) + '</div>' +
      '<div class="conv-item__body">' +
        '<div class="conv-item__top"><span class="conv-item__name">' + esc(c.name) + '</span><span class="conv-item__time">' + c.time + '</span></div>' +
        '<div class="conv-item__preview">' + preview(c) + '</div>' +
        '<div class="conv-item__source"><span class="zalo-ic">Z</span><span>' + esc(c.src) + '</span></div>' +
      '</div>' +
      (c.unread ? '<span class="conv-item__unread">' + c.unread + '</span>' : '') +
    '</div>';
  }).join('');
  // Chạm hội thoại → mở màn chat (mock: nội dung chat theo Kd Vanhoa)
  document.getElementById('convList').addEventListener('click', function(e){
    if (e.target.closest('.conv-item')) navOpen('view-chat');
  });

  // ================== KHÁCH HÀNG — màn CRM Liên hệ ==================
  var STAGE = {
    subscriber:{name:'Đăng ký', color:'#2563eb'}, lead:{name:'Lead', color:'#f59e0b'},
    qualified:{name:'Đủ điều kiện', color:'#9333ea'}, opportunity:{name:'Cơ hội', color:'#ea580c'},
    customer:{name:'Khách hàng', color:'#16a34a'}, evangelist:{name:'VIP/Đại sứ', color:'#0891b2'},
    churned:{name:'Rời bỏ', color:'#ef4444'}
  };
  var CUSTOMERS = [
    {init:'AT', color:'#3b82f6', name:'Anh Trường Hưng Yên', phone:'0786363363', stage:'lead', source:'Zalo', sale:'Lộc Thị Hạnh', score:35},
    {init:'H',  color:'#ef4444', name:'Hb', phone:'0912456789', stage:'subscriber', source:'Zalo', sale:'Ngọc Thảo', score:0},
    {init:'KV', color:'#ec4899', name:'Kd Vanhoa', phone:'0348302234', stage:'subscriber', source:'Zalo', sale:'Lộc Thị Hạnh', score:0},
    {init:'LH', color:'#0ea5e9', name:'Lộc Hạnh TDVN', phone:'0325173345', stage:'customer', source:'Zalo OA', sale:'Lộc Thị Hạnh', score:120},
    {init:'ML', color:'#0ea5e9', name:'Mỹ Linh', phone:'0933305238', stage:'opportunity', source:'Facebook', sale:'Tuấn Anh Đỗ', score:68},
    {init:'MS', color:'#9333ea', name:'Mộc Sơn', phone:'0977123456', stage:'qualified', source:'Website', sale:'Ngọc Thảo', score:52},
    {init:'NC', color:'#16a34a', name:'Nam Cuong', phone:'0911127166', stage:'customer', source:'Zalo', sale:'Lộc Thị Hạnh', score:210},
    {init:'NP', color:'#8b5cf6', name:'Nam Phong', phone:'0983281986', stage:'lead', source:'Zalo', sale:'Tuấn Anh Đỗ', score:40},
    {init:'NT', color:'#9333ea', name:'Ngọc Thảo TDVN', phone:'0325173345', stage:'evangelist', source:'Zalo OA', sale:'Lộc Thị Hạnh', score:520}
  ];
  document.getElementById('custCount').textContent = CUSTOMERS.length + ' liên hệ';
  var callSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>';
  var chatSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>';
  document.getElementById('custList').innerHTML = CUSTOMERS.map(function(c){
    var s = STAGE[c.stage];
    return '<div class="crm-card">' +
      '<div class="crm-card__top" data-open-chat>' +
        '<div class="crm-card__avatar" style="background:' + c.color + ';">' + esc(c.init) + '</div>' +
        '<div class="crm-card__body"><div class="crm-card__name">' + esc(c.name) + '</div>' +
        '<div class="crm-card__phone">' + c.phone + '</div></div>' +
        '<span class="crm-stage" style="background:' + s.color + '18; color:' + s.color + ';">' +
          '<span class="crm-stage__dot" style="background:' + s.color + ';"></span>' + s.name + '</span>' +
      '</div>' +
      '<div class="crm-card__meta">' +
        '<span class="crm-tag">🌐 ' + esc(c.source) + '</span>' +
        '<span class="crm-tag">👤 ' + esc(c.sale) + '</span>' +
        '<span class="crm-tag">⭐ ' + c.score + ' điểm</span>' +
      '</div>' +
      '<div class="crm-card__actions">' +
        '<button class="crm-card__btn" data-call onclick="event.stopPropagation()">' + callSvg + ' Gọi</button>' +
        '<button class="crm-card__btn crm-card__btn--primary" data-open-chat>' + chatSvg + ' Nhắn tin</button>' +
      '</div>' +
    '</div>';
  }).join('');
  document.getElementById('custList').addEventListener('click', function(e){
    if (e.target.closest('[data-call]')) return;
    if (e.target.closest('[data-open-chat]')) navOpen('view-chat');
  });
  // Thêm KH → bottom sheet
  var addCustSheet = document.getElementById('addCustSheet');
  document.getElementById('btnAddCust').addEventListener('click', function(){ addCustSheet.classList.add('open'); });
  function closeAddCust(){ addCustSheet.classList.remove('open'); }
  document.getElementById('addCustClose').addEventListener('click', closeAddCust);
  document.getElementById('addCustCancel').addEventListener('click', closeAddCust);
  addCustSheet.addEventListener('click', function(e){ if (e.target === addCustSheet) closeAddCust(); });
  document.getElementById('addCustSubmit').addEventListener('click', function(){
    closeAddCust();
    alert('Giao diện mẫu — chưa nối API, liên hệ chưa được lưu thật.');
  });

  // ================== CHAT ==================
  function nowTime(){
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  var TICKS = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>';
  function chatScrollBottom(){
    var m = document.getElementById('chatMessages');
    m.scrollTop = m.scrollHeight;
  }
  // Gửi tin nhắn văn bản
  function sendText(){
    var inp = document.getElementById('chatInput');
    var t = inp.value.trim();
    if (!t) return;
    var w = document.createElement('div');
    w.className = 'msg-wrapper';
    w.innerHTML = '<div class="msg msg--sent"><div class="msg__avatar" style="background:#16a34a;">VĐ</div>' +
      '<div><div class="msg__bubble"></div><div class="msg__time">' + nowTime() + TICKS + '</div></div></div>';
    w.querySelector('.msg__bubble').textContent = t;
    document.getElementById('chatMessages').appendChild(w);
    inp.value = ''; inp.style.height = '';
    chatScrollBottom();
  }
  document.getElementById('btnSend').addEventListener('click', sendText);
  document.getElementById('chatInput').addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendText(); }
  });
  document.getElementById('chatInput').addEventListener('input', function(){
    this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 96) + 'px';
  });

  // Mở hồ sơ khách / thư viện / menu xóa
  function openDetailTab(tab){
    if (!document.getElementById('view-detail').classList.contains('view--open')) navOpen('view-detail');
    document.querySelector('.detail-tab[data-tab="' + tab + '"]').click();
  }
  document.getElementById('btnOpenDetail').addEventListener('click', function(){ navOpen('view-detail'); });
  document.getElementById('btnChatLibrary').addEventListener('click', function(){ navOpen('view-library'); });
  // Nút thao tác nhanh trên ô nhập — menu hồ sơ đưa ra ngoài cho tiện thao tác
  document.getElementById('btnQuickOrder').addEventListener('click', function(){ openDetailTab('order'); });
  document.getElementById('btnQuickSales').addEventListener('click', function(){ openDetailTab('sales'); });
  document.getElementById('btnQuickInfo').addEventListener('click', function(){ openDetailTab('info'); });
  document.getElementById('btnQuickNotes').addEventListener('click', function(){ openDetailTab('notes'); });
  document.getElementById('btnChatMore').addEventListener('click', function(e){
    e.stopPropagation();
    var m = document.getElementById('chatMoreMenu');
    m.hidden = !m.hidden;
  });
  document.addEventListener('click', function(e){
    var m = document.getElementById('chatMoreMenu');
    if (!m.hidden && !e.target.closest('#btnChatMore') && !e.target.closest('#chatMoreMenu')) m.hidden = true;
  });
  // Chọn chế độ AI trả lời (trong menu ⋯)
  document.querySelectorAll('.cmm-ai').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.cmm-ai').forEach(function(b){ b.classList.remove('cmm-ai--active'); });
      btn.classList.add('cmm-ai--active');
      document.getElementById('chatMoreMenu').hidden = true;
    });
  });
  document.getElementById('btnDeleteConv').addEventListener('click', function(){
    document.getElementById('chatMoreMenu').hidden = true;
    if (confirm('Xóa toàn bộ hội thoại với "Kd Vanhoa 0348302234"?\\nHành động này không thể hoàn tác.')){
      alert('Giao diện mẫu — chưa nối API, hội thoại chưa bị xóa thật.');
    }
  });

  // ================== HỒ SƠ KHÁCH: 4 TAB ==================
  document.querySelectorAll('.detail-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.detail-tab').forEach(function(t){ t.classList.remove('detail-tab--active'); });
      document.querySelectorAll('.detail-panel').forEach(function(p){ p.classList.remove('detail-panel--active'); });
      tab.classList.add('detail-tab--active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('detail-panel--active');
      document.getElementById('detailBody').scrollTop = 0;
    });
  });
  document.getElementById('btnGoOrder').addEventListener('click', function(){
    document.querySelector('.detail-tab[data-tab="order"]').click();
  });
  document.getElementById('btnViewHistory').addEventListener('click', function(){ navOpen('view-history'); });

  // ================== KHO LƯU TRỮ ==================
  document.querySelectorAll('.lib__tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.lib__tab').forEach(function(t){ t.classList.remove('lib__tab--active'); });
      document.querySelectorAll('.lib__panel').forEach(function(p){ p.classList.remove('lib__panel--active'); });
      tab.classList.add('lib__tab--active');
      document.getElementById('lib-' + tab.dataset.lib).classList.add('lib__panel--active');
    });
  });

  // ================== TÀI LIỆU BÁN HÀNG ==================
  document.querySelectorAll('.sd__tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.sd__tab').forEach(function(t){ t.classList.remove('sd__tab--active'); });
      document.querySelectorAll('.sd__panel').forEach(function(p){ p.classList.remove('sd__panel--active'); });
      tab.classList.add('sd__tab--active');
      document.getElementById('sd-' + tab.dataset.sd).classList.add('sd__panel--active');
    });
  });
  function sdFilter(panelId, q){
    q = q.trim().toLowerCase();
    var panel = document.getElementById(panelId);
    var found = false;
    if (panelId === 'sd-content'){
      panel.querySelectorAll('.sd-content').forEach(function(card){
        var show = !q || card.textContent.toLowerCase().indexOf(q) > -1;
        card.style.display = show ? '' : 'none'; found = found || show;
      });
    } else {
      panel.querySelectorAll('.sd__group').forEach(function(g){
        var grid = g.nextElementSibling, any = false;
        grid.querySelectorAll('.sd-tile').forEach(function(t){
          var inp = t.querySelector('input');
          var hay = ((inp.dataset.name || '') + ' ' + (inp.dataset.code || '')).toLowerCase();
          var show = !q || hay.indexOf(q) > -1;
          t.style.display = show ? '' : 'none'; any = any || show;
        });
        g.style.display = any ? '' : 'none'; grid.style.display = any ? '' : 'none';
        found = found || any;
      });
    }
    var empty = panel.querySelector('.sd__empty');
    if (empty) empty.hidden = found;
  }
  document.querySelectorAll('.sd__search input').forEach(function(inp){
    inp.addEventListener('input', function(){ sdFilter(inp.closest('.sd__panel').id, inp.value); });
  });
  function sdUpdateCount(pid){
    var n = document.querySelectorAll('#' + pid + ' .sd-tile input:checked').length;
    var btn = document.querySelector('.sd__send-btn[data-send="' + pid + '"]');
    btn.disabled = n === 0;
    btn.textContent = '📤 Gửi vào chat (' + n + ')';
  }
  ['sd-images', 'sd-video'].forEach(function(pid){
    document.getElementById(pid).addEventListener('change', function(e){
      if (e.target.matches('.sd-tile input')) sdUpdateCount(pid);
    });
  });
  document.querySelectorAll('.sd__send-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var pid = btn.dataset.send, isVideo = pid === 'sd-video';
      var checked = document.querySelectorAll('#' + pid + ' .sd-tile input:checked');
      if (!checked.length) return;
      checked.forEach(function(chk){
        var w = document.createElement('div');
        w.className = 'msg-wrapper';
        w.innerHTML = '<div class="msg msg--sent"><div class="msg__avatar" style="background:#16a34a;">VĐ</div>' +
          '<div><div class="msg__image" style="max-width:190px; padding:14px 10px;">' +
          '<div style="font-size:32px;">' + chk.dataset.emoji_ + '</div>' +
          '<div style="font-size:12px; font-weight:600; color:var(--gray-700); margin-top:4px;"></div></div>' +
          '<div class="msg__time">' + nowTime() + TICKS + '</div></div></div>';
        var emoji = chk.closest('.sd-tile').querySelector('.sd-tile__emoji').textContent;
        w.querySelector('.msg__image div:first-child').textContent = emoji + (isVideo ? ' ▶' : '');
        w.querySelector('.msg__image div:last-child').textContent = (isVideo ? 'Video: ' : '') + chk.dataset.name;
        document.getElementById('chatMessages').appendChild(w);
        chk.checked = false;
      });
      sdUpdateCount(pid);
      // Quay về màn chat để thấy tài liệu vừa gửi
      while (navStack.length) navBack();
      navOpen('view-chat');
      chatScrollBottom();
    });
  });
  document.querySelectorAll('.sd-content__copy').forEach(function(btn){
    btn.addEventListener('click', function(){
      var text = btn.closest('.sd-content').querySelector('.sd-content__text').textContent;
      var done = function(){
        btn.classList.add('sd-content__copy--done'); btn.textContent = '✓ Đã copy';
        setTimeout(function(){ btn.classList.remove('sd-content__copy--done'); btn.textContent = '📋 Copy'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else done();
    });
  });

  // ================== AI PHÂN TÍCH ==================
  var AI_LAST_TIME = null;
  var AI_NOTE_TEXT =
    '👤 Chân dung: Khách mới từ Zalo cá nhân (kênh Vận Đơn TDVN), pipeline Đăng ký, Lead 0/100. Hôm nay là sinh nhật khách (18/08).\\n' +
    '💬 Hội thoại: Shop gửi 1 ảnh (13/06), hệ thống gửi thiệp sinh nhật hôm nay — khách chưa phản hồi.\\n' +
    '🎯 Cơ hội: Dùng dịp sinh nhật mở lại hội thoại, tiềm năng chuyển Đăng ký → Lead.\\n' +
    '✅ Đề xuất: 1) Chúc sinh nhật cá nhân hoá; 2) Tặng mã ưu đãi sinh nhật hạn 7 ngày; 3) Giới thiệu Trà Đinh Ngọc 100g khi khách phản hồi.';
  document.getElementById('btnAiAnalyze').addEventListener('click', function(){
    document.getElementById('aiModalBg').classList.add('open');
    document.getElementById('aiLoading').hidden = false;
    document.getElementById('aiResult').hidden = true;
    document.getElementById('btnAiToNote').disabled = true;
    setTimeout(function(){
      var d = new Date();
      AI_LAST_TIME = ('0'+d.getDate()).slice(-2) + '/' + ('0'+(d.getMonth()+1)).slice(-2) + '/' + d.getFullYear() + ' · ' + nowTime();
      document.getElementById('aiTime').textContent = 'Lượt phân tích gần nhất: ' + AI_LAST_TIME;
      document.getElementById('aiLoading').hidden = true;
      document.getElementById('aiResult').hidden = false;
      document.getElementById('btnAiToNote').disabled = false;
    }, 900);
  });
  function aiClose(){ document.getElementById('aiModalBg').classList.remove('open'); }
  document.getElementById('aiModalClose').addEventListener('click', aiClose);
  document.getElementById('aiModalClose2').addEventListener('click', aiClose);
  document.getElementById('aiModalBg').addEventListener('click', function(e){ if (e.target === this) aiClose(); });
  document.getElementById('btnAiToNote').addEventListener('click', function(){
    var item = document.createElement('div');
    item.className = 'note-item note-item--ai';
    item.innerHTML = '<div class="note-item__head"><span class="note-item__tag">🤖 AI phân tích</span>' +
      '<span class="note-item__time">' + AI_LAST_TIME + '</span></div><div class="note-item__body"></div>';
    item.querySelector('.note-item__body').textContent = AI_NOTE_TEXT;
    var list = document.getElementById('notesList');
    list.insertBefore(item, list.firstChild);
    document.getElementById('notesEmpty').hidden = true;
    aiClose();
    document.querySelector('.detail-tab[data-tab="notes"]').click();
  });

  // ================== TẠO ĐƠN — logic theo CRM/tao-don.html ==================
  var opParseNum = function(v){ return Number(String(v || '').replace(/[^\\d]/g, '')) || 0; };
  var opFmt = function(n){ return new Intl.NumberFormat('vi-VN').format(Math.max(0, Math.round(n))); };
  var opMoney = function(n){ return opFmt(n) + 'đ'; };
  var OP_LA_RATE = 1000;
  var opTransfer = 0, opPoints = 0, opSubtotal = 587000;
  var OF_SELF_MODES = [
    {name:'CHỜ VẬN ĐƠN', fee:20000},
    {name:'Nhân viên công ty đi giao', fee:20000},
    {name:'Gửi xe khách', fee:30000},
    {name:'Gửi xe buýt', fee:30000}
  ];
  var OF_CARRIERS_HTML = document.getElementById('ofShipUnit').innerHTML;
  function ofShipFee(){ return opParseNum(document.getElementById('ofShipCost').value); }
  function ofOrderTotal(){
    var disc = Math.min(100, opParseNum(document.getElementById('ofDiscount').value));
    return Math.max(opSubtotal - Math.round(opSubtotal * disc / 100) - opPoints * OP_LA_RATE, 0) + ofShipFee();
  }
  function ofRenderPayment(){
    var total = ofOrderTotal();
    var due = Math.max(total - opTransfer, 0);
    document.getElementById('ofPayShip').textContent = opMoney(ofShipFee());
    document.getElementById('ofPayTotal').textContent = opFmt(total);
    document.getElementById('ofLaMoney').textContent = opPoints > 0 ? '−' + opMoney(opPoints * OP_LA_RATE) : '0đ';
    document.getElementById('ofDeposit').textContent = opMoney(Math.min(opTransfer, total));
    document.getElementById('ofPayCod').textContent = opMoney(due);
    var s = document.getElementById('ofPayStatus');
    s.className = 'of__pay-badge';
    if (opTransfer <= 0){ s.textContent = 'Chưa thanh toán'; }
    else if (opTransfer < total){ s.textContent = 'Đặt cọc một phần'; s.classList.add('of__pay-badge--orange'); }
    else if (opTransfer === total){ s.textContent = '✓ Đã thanh toán đủ'; s.classList.add('of__pay-badge--green'); }
    else { s.textContent = '⚠ Đặt cọc vượt tổng đơn'; s.classList.add('of__pay-badge--red'); }
  }
  function ofRecalcProducts(){
    var subtotal = 0, qtySum = 0, klSum = 0;
    var items = document.querySelectorAll('#ofProdList .op-item');
    items.forEach(function(it){
      var q = Math.max(1, opParseNum(it.querySelector('.op-qty input').value) || 1);
      var gia = Number(it.dataset.gia) || 0, kl = Number(it.dataset.kl) || 0, ton = Number(it.dataset.ton) || 0;
      it.querySelector('.op-item__sum').textContent = opFmt(gia * q);
      it.querySelector('.op-item__kl').textContent = (kl * q) + 'g';
      it.classList.toggle('op-item--over', ton > 0 && q > ton);
      subtotal += gia * q; qtySum += q; klSum += kl * q;
    });
    document.getElementById('ofProdEmpty').hidden = items.length > 0;
    var totalRow = document.getElementById('ofProdTotal');
    totalRow.hidden = items.length === 0;
    totalRow.innerHTML = '<span>Tổng: ' + qtySum + ' SP · ' + klSum + 'g</span><b>' + opMoney(subtotal) + '</b>';
    var w = document.getElementById('ofShipWeight');
    if (w && !w.dataset.manual) w.value = klSum;
    opSubtotal = Math.round(subtotal);
    ofRenderPayment();
  }
  document.getElementById('ofShipWeight').addEventListener('input', function(){ this.dataset.manual = 1; });
  document.getElementById('ofProdList').addEventListener('click', function(e){
    var btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('op-item__del')){ btn.closest('.op-item').remove(); ofRecalcProducts(); }
    else if (btn.dataset.d){
      var input = btn.parentElement.querySelector('input');
      input.value = Math.max(1, (parseInt(input.value || '1', 10) || 1) + Number(btn.dataset.d));
      ofRecalcProducts();
    }
  });
  document.getElementById('ofProdList').addEventListener('input', function(e){
    if (e.target.matches('.op-qty input')) ofRecalcProducts();
  });
  document.getElementById('ofProdList').addEventListener('change', function(e){
    if (e.target.matches('.op-qty input')){
      e.target.value = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
      ofRecalcProducts();
    }
  });
  document.getElementById('ofDiscount').addEventListener('input', function(){
    var v = this.value.replace(/[^\\d]/g, '');
    if (Number(v) > 100) v = '100';
    this.value = v; ofRenderPayment();
  });
  document.getElementById('ofPoints').addEventListener('input', function(){
    opPoints = opParseNum(this.value); this.value = opFmt(opPoints); ofRenderPayment();
  });
  document.getElementById('ofTransfer').addEventListener('input', function(){
    opTransfer = opParseNum(this.value); this.value = opFmt(opTransfer); ofRenderPayment();
  });
  function ofSyncShipSelection(){
    var sel = document.getElementById('ofShipUnit');
    var o = sel.options[sel.selectedIndex];
    document.getElementById('ofShipCost').value = opFmt(Number(o.dataset.fee) || 0);
    document.getElementById('ofShipBrand').textContent = o.text.split(' - ')[0].toUpperCase();
    if (o.dataset.info) document.getElementById('ofShipInfo').innerHTML = 'ⓘ <b>Thông tin:</b> ' + o.dataset.info;
    ofRenderPayment();
  }
  document.getElementById('ofShipUnit').addEventListener('change', ofSyncShipSelection);
  document.getElementById('ofSelfShip').addEventListener('change', function(){
    var sel = document.getElementById('ofShipUnit');
    var cost = document.getElementById('ofShipCost');
    if (this.checked){
      sel.innerHTML = OF_SELF_MODES.map(function(m, i){
        return '<option data-fee="' + m.fee + '"' + (i === 0 ? ' selected' : '') + '>' + m.name + '</option>';
      }).join('');
      document.getElementById('ofShipCostLabel').textContent = 'Chi phí Tự giao';
      cost.disabled = false;
      document.getElementById('ofShipInfo').style.display = 'none';
    } else {
      sel.innerHTML = OF_CARRIERS_HTML;
      document.getElementById('ofShipCostLabel').textContent = 'Chi phí vận chuyển';
      cost.disabled = true;
      document.getElementById('ofShipInfo').style.display = '';
    }
    ofSyncShipSelection();
  });
  document.getElementById('ofShipCost').addEventListener('input', function(){
    this.value = opFmt(opParseNum(this.value)); ofRenderPayment();
  });
  // Đơn đổi trả: hiện ghi chú + tự thêm vào ô Ghi chú đơn hàng
  var RETURN_NOTE_TEXT = 'Đơn đổi trả: Thu hàng cũ đổi đơn mới & thu COD chênh lệch';
  document.getElementById('ofReturnCheck').addEventListener('change', function(){
    var banner = document.getElementById('ofReturnNote');
    var note = document.getElementById('ofOrderNote');
    if (this.checked){
      banner.classList.add('of__return-note--show');
      if (note.value.indexOf(RETURN_NOTE_TEXT) === -1){
        note.value = note.value ? note.value.replace(/\\s+$/, '') + '\\n' + RETURN_NOTE_TEXT : RETURN_NOTE_TEXT;
      }
    } else {
      banner.classList.remove('of__return-note--show');
      note.value = note.value.split('\\n').filter(function(l){ return l.trim() !== RETURN_NOTE_TEXT; }).join('\\n').replace(/^\\n+|\\n+$/g, '');
    }
  });
  document.getElementById('ofSubmit').addEventListener('click', function(){
    if (!document.querySelector('#ofProdList .op-item:not([data-gia="0"])')){
      alert('Chưa có sản phẩm nào trong đơn — thêm sản phẩm trước khi tạo đơn.');
      return;
    }
    var total = ofOrderTotal();
    var due = Math.max(total - opTransfer, 0);
    alert('Giao diện mẫu — chưa nối API, đơn CHƯA được lưu.\\nDữ liệu sẽ gửi đi khi nối API:\\n\\n' +
      'Tổng đơn: ' + opMoney(total) + '\\n' +
      'Tiêu Lá: ' + opPoints + ' Lá (−' + opMoney(opPoints * OP_LA_RATE) + ')\\n' +
      'Đặt cọc CK: ' + opMoney(opTransfer) + '\\n' +
      'COD còn thu: ' + opMoney(due));
  });
  ofRecalcProducts();`;St(async()=>{var t;document.getElementById("app").innerHTML=ui;const n=document.createElement("script");n.textContent=pi,document.body.appendChild(n),ii(),zn(),$n(),hi(),(t=w.user())!=null&&t.impersonatedBy||document.querySelectorAll(".impersonate").forEach(i=>{i.style.display="none"});const e=w.user();if(e!=null&&e.fullName){const i=e.fullName.trim().split(/\s+/),s=(i.length>1?i[0][0]+i[i.length-1][0]:i[0].slice(0,2)).toUpperCase();document.querySelectorAll(".avatar-lg, .me-avatar").forEach(o=>{o.textContent.trim().length<=2&&(o.textContent=s)})}});"serviceWorker"in navigator&&window.addEventListener("load",()=>{navigator.serviceWorker.register("/m/sw.js",{scope:"/m/"}).catch(()=>{})});
//# sourceMappingURL=index-CYeKZTFX.js.map
