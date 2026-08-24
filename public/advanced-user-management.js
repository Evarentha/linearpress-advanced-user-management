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

(function () {
  'use strict';

  /* ---------------- 用户下拉菜单 ---------------- */
  function initUserMenu() {
    var trigger = document.querySelector('.aum-user-menu .aum-menu-trigger');
    var menu = document.querySelector('.aum-user-menu .aum-dropdown');
    if (!trigger || !menu) return;
    trigger.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = menu.getAttribute('data-open') === 'true';
      menu.setAttribute('data-open', open ? 'false' : 'true');
      trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    document.addEventListener('click', function () {
      menu.setAttribute('data-open', 'false');
      trigger.setAttribute('aria-expanded', 'false');
    });
    menu.addEventListener('click', function (event) { event.stopPropagation(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        menu.setAttribute('data-open', 'false');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------- 注册：密码二次确认 ---------------- */
  function initRegisterForm() {
    var form = document.querySelector('form[data-aum-register]');
    if (!form) return;
    var password = form.querySelector('input[name="password"]');
    var confirmation = form.querySelector('input[name="password_confirmation"]');
    var hint = form.querySelector('[data-aum-confirm-hint]');
    if (!password || !confirmation) return;

    function validate() {
      var mismatch = confirmation.value.length > 0 && password.value !== confirmation.value;
      if (hint) hint.hidden = !mismatch;
      confirmation.setCustomValidity(mismatch ? '两次输入的密码不一致' : '');
    }
    password.addEventListener('input', validate);
    confirmation.addEventListener('input', validate);
    form.addEventListener('submit', function (event) {
      validate();
      if (confirmation.validationMessage) event.preventDefault();
    });
  }

  /* ---------------- 设置页：模板文件 -> textarea ---------------- */
  function initTemplateUpload() {
    var fileInput = document.getElementById('aum-template-file');
    if (!fileInput) return;
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      var target = document.querySelector('textarea[name="' + fileInput.getAttribute('data-aum-target') + '"]');
      if (!file || !target) return;
      var reader = new FileReader();
      reader.onload = function () { target.value = String(reader.result || ''); };
      reader.readAsText(file);
    });
  }

  /* ---------------- 设置页：SMTP 测试 ---------------- */
  function initSmtpTest() {
    var button = document.getElementById('aum-smtp-test');
    if (!button) return;
    button.addEventListener('click', async function () {
      var url = button.getAttribute('data-url');
      var result = document.getElementById('aum-smtp-result');
      var form = button.closest('form');
      if (!form || !url) return;
      if (result) result.textContent = '正在发送测试邮件…';
      try {
        var body = new FormData(form);
        body.set('mail_template', 'default');
        var response = await fetch(url, { method: 'POST', body: body });
        var data = await response.json();
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
    document.querySelectorAll('[data-aum-confirm]').forEach(function (element) {
      element.addEventListener('click', function (event) {
        var message = element.getAttribute('data-aum-confirm');
        if (!window.confirm(message)) event.preventDefault();
      });
    });
  }

  /* ---------------- 通用：data-aum-fetch AJAX 表单（重发邮件等） ---------------- */
  function initFetchForms() {
    document.querySelectorAll('form[data-aum-fetch]').forEach(function (form) {
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var button = form.querySelector('button');
        var original = button ? button.textContent : '';
        if (button) { button.disabled = true; button.textContent = '…'; }
        try {
          var response = await fetch(form.action, { method: form.method || 'POST', body: new FormData(form) });
          var data = await response.json();
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