package middleware

import (
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"
)

// RateLimiter implements a per-IP token-bucket rate limiter.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int
	window   time.Duration
}

type visitor struct {
	tokens   int
	lastSeen time.Time
}

// NewRateLimiter creates a rate limiter that allows `rate` requests per `window` per IP.
func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate,
		window:   window,
	}
	go rl.cleanup()
	return rl
}

// Limit returns a middleware that enforces the rate limit.
func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !rl.allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", fmt.Sprintf("%d", int(rl.window.Seconds())))
			w.WriteHeader(http.StatusTooManyRequests)
			fmt.Fprint(w, `{"error":"too many requests"}`)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (rl *RateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[key]
	now := time.Now()

	if !exists {
		rl.visitors[key] = &visitor{tokens: rl.rate - 1, lastSeen: now}
		return true
	}

	// Refill tokens proportionally to elapsed time.
	elapsed := now.Sub(v.lastSeen)
	v.lastSeen = now

	interval := rl.window / time.Duration(rl.rate)
	refill := int(elapsed / interval)
	v.tokens += refill
	if v.tokens > rl.rate {
		v.tokens = rl.rate
	}

	if v.tokens <= 0 {
		return false
	}

	v.tokens--
	return true
}

// cleanup removes stale visitors periodically.
func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(rl.window * 3)
		rl.mu.Lock()
		for key, v := range rl.visitors {
			if time.Since(v.lastSeen) > rl.window*3 {
				delete(rl.visitors, key)
			}
		}
		rl.mu.Unlock()
	}
}

func extractIP(r *http.Request) string {
	// chi's RealIP middleware sets RemoteAddr to the real IP.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
