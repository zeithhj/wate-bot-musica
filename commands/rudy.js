const i18n = require("../util/i18n");
const { MessageEmbed } = require("discord.js");
const { play } = require("../include/play");
const YouTubeAPI = require("simple-youtube-api");
const scdl = require("soundcloud-downloader").default;
const { YOUTUBE_API_KEY, SOUNDCLOUD_CLIENT_ID, MAX_PLAYLIST_SIZE, DEFAULT_VOLUME } = require("../util/Util");
const youtube = new YouTubeAPI(YOUTUBE_API_KEY);

module.exports = {
  name: "rudy",
  cooldown: 5,
  aliases: ["rudy"],
  description: i18n.__("rudy.description"),
  async execute(message, args) {
    const { channel } = message.member.voice;
    const serverQueue = message.client.queue.get(message.guild.id);

    if (args.length)
      return message
        .reply(i18n.__mf("rudy.usagesReply", { prefix: message.client.prefix }))
        .catch(console.error);

    if (!channel) return message.reply(i18n.__("playlist.errorNotChannel")).catch(console.error);

    const permissions = channel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT")) return message.reply(i18n.__("playlist.missingPermissionConnect"));
    if (!permissions.has("SPEAK")) return message.reply(i18n.__("missingPermissionSpeak"));

    if (serverQueue && channel !== message.guild.me.voice.channel)
      return message
        .reply(i18n.__mf("play.errorNotInSameChannel", { user: message.client.user }))
        .catch(console.error);

    args = ["https://youtube.com/playlist?list=PLVDYz-YtA4sXzYm7O231n2RASXbcifDr7"];

    const search = args.join(" ");
    const pattern = /^.*(youtu.be\/|list=)([^#\&\?]*).*/gi;
    const url = args[0];
    const urlValid = pattern.test(args[0]);

    const queueConstruct = {
      textChannel: message.channel,
      channel,
      connection: null,
      songs: [],
      loop: false,
      volume: DEFAULT_VOLUME,
      muted: false,
      playing: true
    };

    let playlist = null;
    let videos = [];

    if (urlValid) {
      try {
        playlist = await youtube.getPlaylist(url, { part: "snippet" });
        videos = await playlist.getVideos(MAX_PLAYLIST_SIZE || 10, { part: "snippet" });
      } catch (error) {
        console.error(error);
        return message.reply(i18n.__("playlist.errorNotFoundPlaylist")).catch(console.error);
      }
    } else if (scdl.isValidUrl(args[0])) {
      if (args[0].includes("/sets/")) {
        message.channel.send(i18n.__("playlist.fetchingPlaylist"));
        playlist = await scdl.getSetInfo(args[0], SOUNDCLOUD_CLIENT_ID);
        videos = playlist.tracks.map((track) => ({
          title: track.title,
          url: track.permalink_url,
          duration: track.duration / 1000
        }));
      }
    } else {
      try {
        const results = await youtube.searchPlaylists(search, 1, { part: "id" });
        playlist = results[0];
        videos = await playlist.getVideos(MAX_PLAYLIST_SIZE, { part: "snippet" });
      } catch (error) {
        console.error(error);
        return message.reply(error.message).catch(console.error);
      }
    }

    let newSongs = videos
      .filter((video) => video.title != "Private video" && video.title != "Deleted video")
      .map((video) => {
        return (song = {
          title: video.title,
          url: video.url,
          duration: video.durationSeconds
        });
      });

    for (let i = newSongs.length - 1; i > 1; i--) {
      let j = 1 + Math.floor(Math.random() * i);
      [newSongs[i], newSongs[j]] = [newSongs[j], newSongs[i]];
    }

    if (serverQueue) {
      serverQueue.songs.push(...newSongs);
      serverQueue.loop = true;
    } else {
      queueConstruct.songs.push(...newSongs);
      queueConstruct.loop = true;
    }

    let playlistEmbed = new MessageEmbed()
      .setTitle(`${playlist.title}`)
      .setDescription(newSongs.map((song, index) => `${index + 1}. ${song.title}`))
      .setURL(playlist.url)
      .setColor("#F8AA2A")
      .setTimestamp();

    if (playlistEmbed.description.length >= 2048)
      playlistEmbed.description =
        playlistEmbed.description.substr(0, 2007) + i18n.__("playlist.playlistCharLimit");

    message.channel.send(i18n.__mf("playlist.startedPlaylist", { author: message.author }), playlistEmbed);

    if (!serverQueue) {
      message.client.queue.set(message.guild.id, queueConstruct);

      try {
        queueConstruct.connection = await channel.join();
        await queueConstruct.connection.voice.setSelfDeaf(true);
        play(queueConstruct.songs[0], message);
      } catch (error) {
        console.error(error);
        message.client.queue.delete(message.guild.id);
        await channel.leave();
        return message.channel.send(i18n.__mf("play.cantJoinChannel", { error: error })).catch(console.error);
      }
    }
  }
};