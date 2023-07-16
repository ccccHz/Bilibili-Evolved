
# 自动切换清晰度
- 官方issue 没有修复的表示 https://github.com/the1812/Bilibili-Evolved/issues/1324
- 根据其他人的评论 得出一下方法
## ref
- https://greasyfork.org/zh-CN/scripts/458957-bilibili%E7%9B%B4%E6%92%AD%E9%BB%98%E8%AE%A4%E6%9C%80%E9%AB%98%E7%94%BB%E8%B4%A8/code
```js
      // 代码
       function process() {
    try {
      const livePlayer = document.querySelector('#live-player')
      livePlayer.dispatchEvent(new Event('mousemove'))
      const qualityWrap = livePlayer.querySelector('.quality-wrap')
      const observer = new MutationObserver(mutations => {
        mutations.some(mutation => {
          try {
            const qualities = mutation.target.querySelectorAll('.quality-it')
            if (qualities.length) {
              qualities[0].click()
              livePlayer.dispatchEvent(new Event('mouseleave'))
              return true
            }
            return false
          } catch (e) {
            console.error(e)
            return false
          } finally {
            observer.disconnect()
          }
        })
      })
      observer.observe(qualityWrap, { childList: true, subtree: true })
      qualityWrap.dispatchEvent(new Event('mouseenter'))
    } catch (e) {
      console.error(e)
    }
  }

  function live() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeName === 'VIDEO') {
            window.setTimeout(process, 600)
            observer.disconnect()
          }
        })
      })
    })
    observer.observe(document, { childList: true, subtree: true })
  }

  live()
```
- https://greasyfork.org/zh-CN/scripts/451099-bilibili%E7%9B%B4%E6%92%AD%E9%BB%98%E8%AE%A4%E5%8E%9F%E7%94%BB%E7%94%BB%E8%B4%A8/code
```js
    'use strict';
    let video = await mscststs.wait("#live-player > video");
    if(video.paused){
        video.addEventListener("playing",changeQuelity);
    }else{
        changeQuelity();
    }


    function changeQuelity(){
        let livePlayer = window.livePlayer;
        if(!livePlayer){
            livePlayer = window.top.livePlayer;
        }
        let info = livePlayer.getPlayerInfo()
        if(info.qualityCandidates.length > 1){
            console.log(info.qualityCandidates);
            for (let index = 0; index < info.qualityCandidates.length; index++) {
                // 想要默认其他画质,请修改"原画"为"原画PRO"诸如此类
                if (info.qualityCandidates[index].desc=="原画") {
                    livePlayer.switchQuality(info.qualityCandidates[index].qn)
                }
                //else{
                  //  livePlayer.switchQuality(info.qualityCandidates[0].qn)
                //}
            }
        }
    }
```
- https://greasyfork.org/zh-CN/scripts/405796-bilibili%E7%9B%B4%E6%92%AD%E9%97%B4%E5%8A%A9%E6%89%8B/code 部分代码
```js
   autoHigh() {
          let time1 = setInterval(function () {
            try {
              let videoDom = document.querySelector("#live-player");
              videoDom.dispatchEvent(new Event("mousemove"));
              let quality = document.querySelector(".quality-wrap");
              quality.dispatchEvent(new Event("mouseenter"));
              if (
                document.querySelector(".quality-it.selected").innerText !=
                "原画"
              ) {
                let list = document.querySelectorAll(".quality-it");
                for (let item of list) {
                  if (item.innerText == "原画") {
                    console.log(item);
                    item.click();
                    // item.dispatchEvent(new Event("click"));
                    break;
                  }
                }
                quality.dispatchEvent(new Event("mouseleave"));
              }
              clearInterval(time1);
            } catch {}
          }, 1000);
        },
```