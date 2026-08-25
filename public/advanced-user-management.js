/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * 高级用户管理 - 前端交互
 * 1) 注册表单密码二次确认实时校验
 * 2) 前台用户下拉菜单（头像/名字）
 * 3) 设置页：自定义模板文件上传填充、SMTP 测试请求
 * 4) 危险操作确认、AJAX 表单提示（data-aum-fetch / data-aum-confirm）
 */

(() => {

  /* ---------------- 用户下拉菜单 ---------------- */
  function initUserMenu() {
    let trigger = document.querySelector('.aum-user-menu .aum-menu-trigger');
    let menu = document.querySelector('.aum-user-menu .aum-dropdown');
    if (!trigger || !menu) return;
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      let open = menu.getAttribute('data-open') === 'true';
      menu.setAttribute('data-open', open ? 'false' : 'true');
      trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    document.addEventListener('click', () => {
      menu.setAttribute('data-open', 'false');
      trigger.setAttribute('aria-expanded', 'false');
    });
    menu.addEventListener('click', (event) => { event.stopPropagation(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        menu.setAttribute('data-open', 'false');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------- 注册：密码二次确认 ---------------- */
  function initRegisterForm() {
    let form = document.querySelector('form[data-aum-register]');
    if (!form) return;
    let password = form.querySelector('input[name="password"]');
    let confirmation = form.querySelector('input[name="password_confirmation"]');
    let hint = form.querySelector('[data-aum-confirm-hint]');
    if (!password || !confirmation) return;

    function validate() {
      let mismatch = confirmation.value.length > 0 && password.value !== confirmation.value;
      if (hint) hint.hidden = !mismatch;
      confirmation.setCustomValidity(mismatch ? '两次输入的密码不一致' : '');
    }
    password.addEventListener('input', validate);
    confirmation.addEventListener('input', validate);
    form.addEventListener('submit', (event) => {
      validate();
      if (confirmation.validationMessage) event.preventDefault();
    });
  }

  /* ---------------- 设置页：模板文件 -> textarea ---------------- */
  function initTemplateUpload() {
    let fileInput = document.getElementById('aum-template-file');
    if (!fileInput) return;
    fileInput.addEventListener('change', () => {
      let file = fileInput.files && fileInput.files[0];
      let target = document.querySelector('textarea[name="' + fileInput.getAttribute('data-aum-target') + '"]');
      if (!file || !target) return;
      let reader = new FileReader();
      reader.onload = () => { target.value = String(reader.result || ''); };
      reader.readAsText(file);
    });
  }

  /* ---------------- 设置页：SMTP 测试 ---------------- */
  function initSmtpTest() {
    let button = document.getElementById('aum-smtp-test');
    if (!button) return;
    button.addEventListener('click', async () => {
      let url = button.getAttribute('data-url');
      let result = document.getElementById('aum-smtp-result');
      let form = button.closest('form');
      if (!form || !url) return;
      if (result) result.textContent = '正在发送测试邮件…';
      try {
        let body = new FormData(form);
        body.set('mail_template', 'default');
        let response = await fetch(url, { method: 'POST', body: body });
        let data = await response.json();
        if (result) {
          result.textContent = data.message || (response.ok ? '已发送' : '发送失败');
          result.style.color = response.ok ? '#16a34a' : '#dc2626';
        }
      } catch (error) {
        if (result) { result.textContent = '请求失败：' + error.message; result.style.color = '#dc2626'; }
      }
    });
  }

  /* ---------------- 通用：data-aum-confirm 确认 ---------------- */
  function initConfirmations() {
    document.querySelectorAll('[data-aum-confirm]').forEach((element) => {
      element.addEventListener('click', (event) => {
        let message = element.getAttribute('data-aum-confirm');
        if (!window.confirm(message)) event.preventDefault();
      });
    });
  }

  /* ---------------- 通用：data-aum-fetch AJAX 表单（重发邮件等） ---------------- */
  function initFetchForms() {
    document.querySelectorAll('form[data-aum-fetch]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        let button = form.querySelector('button');
        let original = button ? button.textContent : '';
        if (button) { button.disabled = true; button.textContent = '…'; }
        try {
          let response = await fetch(form.action, { method: form.method || 'POST', body: new FormData(form) });
          let data = await response.json();
          window.alert(data.message || (response.ok ? '操作成功' : '操作失败'));
        } catch (error) {
          window.alert('请求失败：' + error.message);
        } finally {
          if (button) { button.disabled = false; button.textContent = original; }
        }
      });
    });
  }

  function boot() {
    initUserMenu();
    initRegisterForm();
    initTemplateUpload();
    initSmtpTest();
    initConfirmations();
    initFetchForms();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();