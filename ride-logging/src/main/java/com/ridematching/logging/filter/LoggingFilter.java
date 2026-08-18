package com.ridematching.logging.filter;

import com.ridematching.logging.config.LoggingProperties;
import com.ridematching.logging.constants.LoggingConstants;
import com.ridematching.logging.util.TraceIdUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

public class LoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(LoggingFilter.class);

    private final LoggingProperties properties;

    public LoggingFilter(LoggingProperties properties) {
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        long startTime = System.currentTimeMillis();

        String traceId = request.getHeader(LoggingConstants.TRACE_ID_HEADER);

        if (traceId == null || traceId.isBlank()) {
            traceId = TraceIdUtil.generateTraceId();
        }

        String correlationId =
                request.getHeader(LoggingConstants.CORRELATION_ID_HEADER);

        if (correlationId == null || correlationId.isBlank()) {
            correlationId = TraceIdUtil.generateTraceId();
        }

        MDC.put(LoggingConstants.TRACE_ID, traceId);
        MDC.put(LoggingConstants.CORRELATION_ID, correlationId);

        response.setHeader(LoggingConstants.TRACE_ID_HEADER, traceId);
        response.setHeader(LoggingConstants.CORRELATION_ID_HEADER, correlationId);

        try {

            if (properties.isRequestLogging()) {

                log.info(
                        "Incoming Request -> {} {} from {}",
                        request.getMethod(),
                        request.getRequestURI(),
                        request.getRemoteAddr()
                );

            }

            filterChain.doFilter(request, response);

        } finally {

            long duration = System.currentTimeMillis() - startTime;

            if (properties.isResponseLogging()) {

                log.info(
                        "Outgoing Response -> status={} duration={}ms",
                        response.getStatus(),
                        duration
                );

            }

            MDC.clear();

        }

    }

}