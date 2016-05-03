interface ForEachFn<T> {
    (node: LRUNode<T>, i: number, cache: LRUCache<T>) : void
}

class LRUNode<T> {
    prev: LRUNode<T>
    next: LRUNode<T>
    
    constructor(public key: number, public data: T){}
    
}

export class LRUCache<T> {
    private head: LRUNode<T>;
    private tail: LRUNode<T>;
    private size = 0;
    private map = new Map<number, LRUNode<T>>();
    
    private lock = false;
    
    constructor(private limit: number = 100000) {
        
    }
    
    private setHead(node: LRUNode<T>) {
        //node is already head
        if(this.head === node) {
            return;
        }
        //cache is empty
        else if(this.head == null) {
            this.head = node;
            this.tail = node;
        } else {
            //node is new
            if(node.next == null && node.prev == null) {
                //no-op
            }
            //node is at the end
            else if(this.tail === node) {
                this.tail = node.next;
                this.tail.prev = null;
            }
            //node is somewhere in the middle 
            else {
                node.prev.next = node.next.prev;
                node.next = null;
            }
            
            let old_head = this.head;        
            
            node.prev = old_head;
            old_head.next = node;
            node.next = null;
            this.head = node;
        }
    }
 
    private purge() {
        let node = this.head;        
        let last_node = this.tail;
        let next_to_last_node = this.tail.next;
        this.tail = next_to_last_node;
        next_to_last_node.prev = null
        this.map.delete(last_node.key);
        this.size--;
    }
    
    public has(key: number): boolean {
        return this.map.has(key);
    }
    
    public get(key: number): T {
        let node = this.map.get(key);
        this.setHead(node);
        return node.data
    }
    
    public set(key: number, value: T) {
        let node = new LRUNode(key, value);
        if (this.map.has(key)) {
            this.remove(key);
        }
        this.map.set(node.key, node)
        this.setHead(node);
        this.size++
        while(this.size >= this.limit) {
            this.purge();
        } 
    }
    
    public remove(key: number) {
        let node = this.map.get(key);
        
        //node is floating due to async calls
        if(node.prev == null && node.next == null) {
            //no-op
        }
        //node is only element
        else if(this.head === node && this.tail === node) {
            this.head = null;
            this.tail = null;
        }
        //node is head
        else if(this.head === node) {
            this.head = node.prev;
            node.prev.next = null;
        }
        //node is tail
        else if(this.tail === node) {
            this.tail = node.next;
            node.next.prev = null;
        }
        //node is in middle
        else {
            node.prev.next = node.next;
            node.next.prev = node.prev;
            node.next = null;
            node.prev = null;
        }
        
        this.map.delete(key);
        this.size--
        
    }
        
}