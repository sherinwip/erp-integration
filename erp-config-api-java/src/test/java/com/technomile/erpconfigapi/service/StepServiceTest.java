package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.dto.StepDtos.StepCreateDto;
import com.technomile.erpconfigapi.dto.StepDtos.StepUpdateDto;
import com.technomile.erpconfigapi.entity.Client;
import com.technomile.erpconfigapi.entity.Step;
import com.technomile.erpconfigapi.entity.Target;
import com.technomile.erpconfigapi.repository.StepRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StepServiceTest {

    @Mock
    private StepRepository stepRepository;
    @Mock
    private ClientService clientService;
    @Mock
    private TargetService targetService;

    @InjectMocks
    private StepService stepService;

    @Test
    void createShouldFailOnClientMismatch() {
        Target target = new Target();
        target.setTargetId("t1");
        target.setClientId("other");
        when(targetService.findEntity("t1")).thenReturn(target);
        when(clientService.findEntity("c1")).thenReturn(new Client());

        AppException ex = assertThrows(AppException.class,
                () -> stepService.create(new StepCreateDto("c1", "t1", "s1", "POST", "/x", null, null, null, null, null, null, null, null)));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatus());
    }

    @Test
    void createShouldFailWhenDuplicateStepName() {
        Target target = new Target();
        target.setTargetId("t1");
        target.setClientId("c1");
        when(targetService.findEntity("t1")).thenReturn(target);
        when(clientService.findEntity("c1")).thenReturn(new Client());
        when(stepRepository.findByClientIdAndStepName("c1", "s1")).thenReturn(Optional.of(new Step()));

        AppException ex = assertThrows(AppException.class,
                () -> stepService.create(new StepCreateDto("c1", "t1", "s1", "POST", "/x", null, null, null, null, null, null, null, null)));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
    }

    @Test
    void createShouldSetDefaults() {
        Target target = new Target();
        target.setTargetId("t1");
        target.setClientId("c1");
        when(targetService.findEntity("t1")).thenReturn(target);
        when(clientService.findEntity("c1")).thenReturn(new Client());
        when(stepRepository.findByClientIdAndStepName("c1", "s1")).thenReturn(Optional.empty());
        when(stepRepository.save(any(Step.class))).thenAnswer(i -> {
            Step s = i.getArgument(0);
            s.setStepPk(1L);
            s.setUpdatedAt(java.time.OffsetDateTime.now());
            return s;
        });

        var out = stepService.create(new StepCreateDto("c1", "t1", "s1", "POST", "/x", Map.of(), Map.of(), Map.of(), null, null, null, null, null));

        assertEquals("fail", out.on_not_found());
        assertEquals("useFirst", out.on_multiple_results());
        assertTrue(out.is_active());
    }

    @Test
    void updateShouldFailOnTargetClientMismatch() {
        Step existing = new Step();
        existing.setStepPk(1L);
        existing.setClientId("c1");
        when(stepRepository.findById(1L)).thenReturn(Optional.of(existing));

        Target target = new Target();
        target.setTargetId("t2");
        target.setClientId("other");
        when(targetService.findEntity("t2")).thenReturn(target);

        AppException ex = assertThrows(AppException.class,
                () -> stepService.update(1L, new StepUpdateDto("t2", null, null, null, null, null, null, null, null, null, null, null)));

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatus());
    }

    @Test
    void updateShouldApplyValues() {
        Step existing = new Step();
        existing.setStepPk(1L);
        existing.setClientId("c1");
        existing.setUpdatedAt(java.time.OffsetDateTime.now());
        when(stepRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(stepRepository.save(any(Step.class))).thenAnswer(i -> i.getArgument(0));

        var out = stepService.update(1L, new StepUpdateDto(null, "s2", "GET", "/y", null, null, null, "skip", "fail", null, null, false));

        assertEquals("s2", out.step_name());
        assertEquals("GET", out.method());
        assertFalse(out.is_active());
    }

    @Test
    void listShouldUseClientFilterWhenProvided() {
        Step s = new Step();
        s.setStepPk(1L);
        s.setClientId("c1");
        s.setUpdatedAt(java.time.OffsetDateTime.now());
        when(stepRepository.findByClientId("c1")).thenReturn(List.of(s));

        var out = stepService.list("c1", 0, 10);

        assertEquals(1, out.size());
    }

    @Test
    void listShouldUsePaginationWhenNoClientFilter() {
        Step s = new Step();
        s.setStepPk(1L);
        s.setClientId("c1");
        s.setUpdatedAt(java.time.OffsetDateTime.now());
        when(stepRepository.findAll(any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(s)));

        var out = stepService.list(null, 0, 10);

        assertEquals(1, out.size());
    }

    @Test
    void getShouldReturnFoundStep() {
        Step s = new Step();
        s.setStepPk(1L);
        s.setClientId("c1");
        s.setUpdatedAt(java.time.OffsetDateTime.now());
        when(stepRepository.findById(1L)).thenReturn(Optional.of(s));

        var out = stepService.get(1L);

        assertEquals(1L, out.step_pk());
    }

    @Test
    void deleteShouldRemoveStep() {
        Step s = new Step();
        s.setStepPk(1L);
        when(stepRepository.findById(1L)).thenReturn(Optional.of(s));

        stepService.delete(1L);

        verify(stepRepository).delete(s);
    }

    @Test
    void updateShouldAllowValidTargetChange() {
        Step existing = new Step();
        existing.setStepPk(1L);
        existing.setClientId("c1");
        existing.setUpdatedAt(java.time.OffsetDateTime.now());
        when(stepRepository.findById(1L)).thenReturn(Optional.of(existing));

        Target target = new Target();
        target.setTargetId("t2");
        target.setClientId("c1");
        when(targetService.findEntity("t2")).thenReturn(target);
        when(stepRepository.save(any(Step.class))).thenAnswer(i -> i.getArgument(0));

        var out = stepService.update(1L, new StepUpdateDto("t2", null, null, null, null, null, null, null, null, null, null, null));

        assertEquals("t2", out.target_id());
    }
}
