/** A delayed old response never enters a newly selected conversation.
 * @param {(url:string)=>Promise<any>} read */
export function chatConversationReader(read) {
  let selected = '',
    generation = 0;
  return {
    get generation() {
      return generation;
    },
    /** @param {string} id */ select(id) {
      selected = id;
      generation++;
    },
    /** @param {number} cursor */ async poll(cursor) {
      const id = selected,
        at = generation;
      const value = await read(
        '/api/home/chat/events?conversationId=' + encodeURIComponent(id) + '&cursor=' + cursor
      );
      return at === generation && id === selected ? value : null;
    }
  };
}
