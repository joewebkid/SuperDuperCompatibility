const target = new URL("https://sdemul.nbmit.ru/report/");
target.search = window.location.search;
window.location.replace(target.href);
