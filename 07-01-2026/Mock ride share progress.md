
[[Mock ride share progress]] [[Live Speech Translation Design]]
Developed a mock uber/grab clone.

Found some difficulty in actually implementing the speech translation. The logic all works, but I am trying to find a better way to use it. maybe instead of an add-on it is best used as a translation app, but then the concern is why not just use google translate.


I think how it should work is, during the ride, there should be an option to go into the driver chat and click a microphone. that should intake your sentence, transform it into text, take the text, convert it to the driver language, then read the text to the driver outloud on the drivers device.


Facing a new issue, the speech button is saying that the speech needs an internet connection. Will look into fix.


I fixed the issue. It seems like the microphone was dependent on apple(safari) and google's (api) speech servers. 

The speech recognition now runs entirely in your browser with Whisper via transformers.js and WASM in a web worker. As of now nothing is sent to an external speech server, it should work within everything now like safari, chromium, and behind vpns. Have not tested, but I know dafair works for now.


Issue now is that it takes a while for the speech to translate while the model initially loads. But text translates instantly and is sent to the opposite user.

I will look into fixing that.


found a bug. When i tried to say "no i cannot stop here" this is what returned.



![[Translation Error.png]]after further review, this may be because i told claude to make a fix while testing this speech translation. will continue to look into it.


Fixed the issue by pre-loading the speech model.

I have found a new issue that persists in other platforms. When words are translated to different languages, the full depth of the sentence is often lost. Here is an example of this that I encountered during testing. In english, our driver asks "can you pick me up here", to which the driver should respond "where should I pick you up"? In spanish the shorthand may be simply "donde esta" instead of "Dónde debería recogerte". Typically drivers will not use full formal speech as typical of humans anywhere. Instead of saying can you please fetch me a glass of water, people will say "can you get me some water". I think to resolve this we can create a model that will auto-correct the translation depending on the context, that way neither side is confused. Converting slang and such too should be considered. I will paste images of the example below.

![[Context Translation example.png]]