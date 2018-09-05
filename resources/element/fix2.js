'use strict';

$(document.body).css('display', 'none');
$(window).on('load', () => {
  const container = $('.page-container.page-component');
  container.find('.page-component__content').first().addClass('page-container-right').css('margin-left', '20px');
  let menu = container.find('.page-component__nav').first();
  menu.addClass('page-container-left').find('.nav-dropdown').remove();
  menu.append('<div class="menu-button">>></div>');

  $('.headerWrapper, .footer-nav, .page-component-up, .demo-block-control button').remove();
  container.addClass('hide-menu');

  const page = $('.el-scrollbar__view');
  page.on('click', '.show-menu .menu-button, .page-container-right', function () {
    container.addClass('hide-menu').removeClass('show-menu');
    container.find('.menu-button').text('>>');
  });
  page.on('click', '.hide-menu .menu-button', function () {
    container.addClass('show-menu').removeClass('hide-menu');
    container.find('.menu-button').text('<<');
  });
  page.on('click', '.side-nav .nav-item a', function () {
    window.parent.postMessage({ title: this.textContent, hash: this.href.split('#').pop() }, '*');
    $('.demo-block-control button, .page-component-up').remove();
  });
  $(document.body).css('display', 'block');
  window.parent.postMessage({ loaded: true }, '*');
});
